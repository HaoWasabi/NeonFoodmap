import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import { PackageSkeleton, staggerStyle } from '../components/Skeleton';
import { useSyncQueue } from '../hooks/useSyncQueue';
import { 
    savePackageToDB, 
    deletePackageFromDB, 
    getPackageFromDB 
} from '../services/offlineStorage';
import { downloadTourOfflinePackage, getAvailableOfflinePackages, OfflineDataSourceError, type OfflinePackageData } from '../services/offlinePackages';

interface OfflinePackage {
    id: string;
    name: string;
    description: string;
    translated_name?: Record<string, string>;
    translated_description?: Record<string, string>;
    poi_count: number;
    size_mb: number;
    downloaded_at?: string;
    downloadProgress?: number;
    downloadStatus?: string;
    source?: string;
    source_detail?: string;
    is_premium?: boolean;
    premium_price?: number;
    is_unlocked?: boolean;
}


export default function OfflineDownload() {
    const { t, i18n } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [packages, setPackages] = useState<OfflinePackage[]>([]);
    const [dataError, setDataError] = useState<string | null>(null);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    const { getPendingCount, flush } = useSyncQueue();
    const [pendingCount, setPendingCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    const navigate = useNavigate();

    // Load saved packages
    useEffect(() => {
        const init = async () => {
            setLoading(true);
            setDataError(null);
            const saved = localStorage.getItem('bcsd_downloaded_packages');
            const downloadedIds: string[] = saved ? JSON.parse(saved) : [];

            // Verify IndexedDB entries exist
            const verifiedIds: string[] = [];
            for (const id of downloadedIds) {
                const entry = await getPackageFromDB(id);
                if (entry) {
                    verifiedIds.push(id);

                    // Nâng cấp record cũ (chỉ có Blob) sang record có payload/stats để dễ kiểm tra.
                    if (!entry.payload && entry.data instanceof Blob) {
                        await savePackageToDB(id, entry.data).catch(() => { /* ignore */ });
                    }
                }
            }

            let availablePackages: OfflinePackageData[] = [];
            try {
                availablePackages = await getAvailableOfflinePackages();
            } catch (error) {
                if (error instanceof OfflineDataSourceError) {
                    setDataError(error.message);
                } else {
                    setDataError('Không tải được dữ liệu offline từ API.');
                }
            }

            setPackages(availablePackages.map(p => ({
                ...p,
                downloaded_at: verifiedIds.includes(p.id) ? new Date().toLocaleDateString('vi-VN') : undefined,
            })));
            setPendingCount(getPendingCount());
            setLoading(false);
        };
        init();
    }, [getPendingCount]);

    // Periodic update pending count
    useEffect(() => {
        const timer = setInterval(() => setPendingCount(getPendingCount()), 5000);
        return () => clearInterval(timer);
    }, [getPendingCount]);

    const handleDownload = useCallback(async (pkg: OfflinePackage) => {
        setDownloadError(null);
        setPackages(prev => prev.map(p => p.id === pkg.id ? { ...p, downloadProgress: 5, downloadStatus: 'Đang tải metadata...' } : p));

        let blob: Blob;
        try {
            blob = await downloadTourOfflinePackage(pkg.id);
        } catch {
            setPackages(prev => prev.map(p => p.id === pkg.id ? { ...p, downloadProgress: undefined, downloadStatus: undefined } : p));
            setDownloadError('Tải gói thất bại từ API. Hãy kiểm tra backend.');
            return;
        }

        try {
            // Lưu metadata vào IndexedDB
            await savePackageToDB(pkg.id, blob);
            
            // Extract media URLs từ blob vừa tải
            const text = await blob.text();
            const payload = JSON.parse(text);
            const mediaUrls: string[] = payload.media_urls || [];
            
            if (mediaUrls.length > 0) {
                setPackages(prev => prev.map(p => p.id === pkg.id ? { ...p, downloadProgress: 10, downloadStatus: `Đang tải 0/${mediaUrls.length} tệp phương tiện...` } : p));
                
                const { downloadMediaWithProgress } = await import('../services/offlinePackages');
                await downloadMediaWithProgress(mediaUrls, (progress, currentUrl) => {
                    const completed = Math.round((progress / 100) * mediaUrls.length);
                    // Metadata chiếm 10%, media chiếm 90%
                    const totalProgress = 10 + Math.round(progress * 0.9);
                    
                    setPackages(prev => prev.map(p => 
                        p.id === pkg.id 
                            ? { ...p, downloadProgress: totalProgress, downloadStatus: `Đang tải ${completed}/${mediaUrls.length} tệp: ${currentUrl.split('/').pop()}` } 
                            : p
                    ));
                });
            }
        } catch (error) {
            console.error('Offline download error:', error);
            setPackages(prev => prev.map(p => p.id === pkg.id ? { ...p, downloadProgress: undefined, downloadStatus: undefined } : p));
            setDownloadError('Đã tải dữ liệu nhưng lưu offline thất bại. Vui lòng kiểm tra bộ nhớ trình duyệt.');
            return;
        }

        setPackages(prev => {
            const updated = prev.map(p => p.id === pkg.id ? { ...p, downloadProgress: undefined, downloadStatus: undefined, downloaded_at: new Date().toLocaleDateString('vi-VN') } : p);
            localStorage.setItem('bcsd_downloaded_packages', JSON.stringify(updated.filter(p => p.downloaded_at).map(p => p.id)));
            localStorage.setItem('bcsd_offline_mode', 'true');
            return updated;
        });
    }, []);

    const handleDelete = useCallback(async (pkg: OfflinePackage) => {
        // Xóa khỏi IndexedDB
        await deletePackageFromDB(pkg.id).catch(() => { /* ignore */ });

        setPackages(prev => {
            const updated = prev.map(p => p.id === pkg.id ? { ...p, downloaded_at: undefined } : p);
            const downloadedIds = updated.filter(p => p.downloaded_at).map(p => p.id);
            localStorage.setItem('bcsd_downloaded_packages', JSON.stringify(downloadedIds));
            if (downloadedIds.length === 0) localStorage.setItem('bcsd_offline_mode', 'false');
            return updated;
        });
    }, []);


    const handleManualSync = useCallback(async () => {
        setIsSyncing(true);
        await flush();
        setPendingCount(getPendingCount());
        setIsSyncing(false);
    }, [flush, getPendingCount]);

    const getSourceLabel = (pkg: OfflinePackage): string => {
        if (pkg.source_detail === 'tour-pois') {
            return 'API: TOUR_POIS';
        }
        return 'API: TOURS_FALLBACK';
    };

    const hasDownloaded = packages.some(p => p.downloaded_at);

    return (
        <AppLayout title={t('offline.title')}>
            {/* Info Banner */}
            <div className="mx-4 mt-4 animate-fade-slide-up">
                <div className="rounded-2xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 p-4 flex gap-3">
                    <div className="size-10 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
                        <span className="material-symbols-outlined text-white text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>offline_bolt</span>
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-900">{t('offline.bannerTitle')}</p>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{t('offline.bannerDescription')}</p>
                    </div>
                </div>
            </div>

            {/* Downloaded indicator */}
            {hasDownloaded && (
                <div className="mx-4 mt-3 animate-bounce-in">
                    <div className="rounded-xl bg-green-50 border border-green-200 p-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-green-600 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        <p className="text-xs font-semibold text-green-700">{t('offline.readyStatus')}</p>
                    </div>
                </div>
            )}

            {dataError && (
                <div className="mx-4 mt-3 animate-fade-slide-up">
                    <div className="rounded-xl bg-red-50 border border-red-200 p-3">
                        <p className="text-xs font-semibold text-red-700">{dataError}</p>
                    </div>
                </div>
            )}

            {downloadError && (
                <div className="mx-4 mt-3 animate-fade-slide-up">
                    <div className="rounded-xl bg-red-50 border border-red-200 p-3">
                        <p className="text-xs font-semibold text-red-700">{downloadError}</p>
                    </div>
                </div>
            )}

            {/* Sync Queue Status */}
            {pendingCount > 0 && (
                <div className="mx-4 mt-3 animate-fade-slide-up">
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="material-symbols-outlined text-amber-500 text-sm shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>sync</span>
                            <p className="text-xs font-semibold text-amber-700 truncate">
                                {t('offline.syncPending', { count: pendingCount })}
                            </p>
                        </div>
                        <button
                            onClick={handleManualSync}
                            disabled={isSyncing || !navigator.onLine}
                            className={`shrink-0 px-3 py-1 rounded-lg text-xs font-bold tap-scale transition-all ${isSyncing
                                ? 'bg-amber-200 text-amber-500'
                                : navigator.onLine
                                    ? 'bg-amber-500 text-white shadow-sm'
                                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                }`}
                        >
                            {isSyncing ? (
                                <span className="flex items-center gap-1">
                                    <span className="size-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    {t('offline.syncing')}
                                </span>
                            ) : 'Sync'}
                        </button>
                    </div>
                </div>
            )}

            {/* Package list */}
            <div className="px-4 mt-5 mb-4">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 px-1">{t('offline.sectionTitle')}</h3>

                {loading ? (
                    <div className="space-y-3">
                        <PackageSkeleton />
                        <PackageSkeleton />
                        <PackageSkeleton />
                    </div>
                ) : packages.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
                        <p className="text-sm font-semibold text-slate-700">Không có gói offline từ API.</p>
                        <p className="text-xs text-slate-500 mt-1">Hãy tạo tour hoặc tour_pois trên trang quản trị.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {packages.map((pkg, i) => {
                            const isDownloading = pkg.downloadProgress !== undefined;
                            const isDownloaded = !!pkg.downloaded_at;
                            const isPremiumLocked = !!(pkg.is_premium && !pkg.is_unlocked);
                            return (
                                <div
                                    key={pkg.id}
                                    className={`rounded-2xl p-4 shadow-sm animate-stagger-item transition-all hover:shadow-md ${
                                        isPremiumLocked
                                            ? 'bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200'
                                            : 'bg-white border border-slate-100'
                                    }`}
                                    style={staggerStyle(i)}
                                >
                                    {/* Header row: icon + badge (same line), title below */}
                                    <div className="flex items-center gap-2 mb-1">
                                        <span
                                            className={`material-symbols-outlined text-lg shrink-0 ${isDownloaded ? 'text-green-500' : isPremiumLocked ? 'text-amber-500' : 'text-primary'}`}
                                            style={{ fontVariationSettings: "'FILL' 1" }}
                                        >
                                            {isDownloaded ? 'folder' : isPremiumLocked ? 'workspace_premium' : 'cloud_download'}
                                        </span>
                                        {isPremiumLocked && (
                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-500 text-white text-[9px] font-bold uppercase tracking-wider shrink-0">
                                                Premium
                                            </span>
                                        )}
                                        <h4 className="text-sm font-bold text-slate-900 flex-1 leading-snug truncate">
                                            {pkg.translated_name?.[i18n.language] || pkg.name}
                                        </h4>
                                    </div>

                                    {/* Description */}
                                    <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 mb-2">
                                        {pkg.translated_description?.[i18n.language] || pkg.description}
                                    </p>

                                    {/* Meta tags */}
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3">
                                        <span className="text-[10px] text-slate-400 font-medium">{pkg.poi_count} {t('common.points')}</span>
                                        <span className="text-[10px] text-slate-300">•</span>
                                        <span className="text-[10px] text-slate-400 font-medium">{pkg.size_mb} MB</span>
                                        <span className="text-[10px] text-slate-300">•</span>
                                        <span className={`text-[10px] font-medium ${pkg.source === 'mock' ? 'text-amber-600' : 'text-blue-600'}`}>
                                            {getSourceLabel(pkg)}
                                        </span>
                                        {isDownloaded && (
                                            <span className="text-[10px] text-green-600 font-medium">
                                                ✓ {t('offline.downloaded')} {pkg.downloaded_at}
                                            </span>
                                        )}
                                    </div>

                                    {/* Action area */}
                                    {isDownloading ? (
                                        <div className="mt-1">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[10px] text-primary font-bold animate-pulse truncate flex-1 mr-2">{pkg.downloadStatus}</span>
                                                <span className="text-[10px] text-primary font-bold shrink-0">{Math.round(pkg.downloadProgress || 0)}%</span>
                                            </div>
                                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                                <div
                                                    className="h-full rounded-full bg-gradient-to-r from-primary to-orange-400 transition-all duration-300 ease-out"
                                                    style={{ width: `${pkg.downloadProgress}%` }}
                                                />
                                            </div>
                                        </div>
                                    ) : isDownloaded ? (
                                        <div className="flex justify-end">
                                            <button
                                                onClick={() => handleDelete(pkg)}
                                                className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 text-xs font-bold hover:bg-red-50 hover:text-red-500 tap-scale transition-all"
                                            >
                                                {t('offline.delete')}
                                            </button>
                                        </div>
                                    ) : isPremiumLocked ? (
                                        /* Premium unlock — full-width button at the bottom */
                                        <button
                                            onClick={() => navigate(`/tours/${pkg.id}`)}
                                            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold shadow-md shadow-amber-400/30 tap-scale hover:shadow-lg hover:shadow-amber-400/40 transition-all"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">lock_open</span>
                                            <span>Mở khóa</span>
                                            {pkg.premium_price != null && (
                                                <span className="bg-white/20 rounded px-1.5 py-0.5 text-[10px] font-semibold">
                                                    {pkg.premium_price.toLocaleString('vi-VN')}đ
                                                </span>
                                            )}
                                        </button>
                                    ) : (
                                        <div className="flex justify-end">
                                            <button
                                                onClick={() => handleDownload(pkg)}
                                                className="px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-bold shadow-sm shadow-primary/20 tap-scale hover:shadow-md transition-all"
                                            >
                                                {t('offline.download')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
