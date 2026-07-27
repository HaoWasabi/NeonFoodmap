import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SketchFrame from '../components/SketchFrame';
import { useSyncQueue } from '../hooks/useSyncQueue';
import { deletePackageFromDB, getPackageFromDB, savePackageToDB } from '../services/offlineStorage';
import { downloadMediaWithProgress, downloadTourOfflinePackage, getAvailableOfflinePackages, OfflineDataSourceError, type OfflinePackageData } from '../services/offlinePackages';

interface OfflinePackage extends OfflinePackageData { downloaded_at?: string; downloadProgress?: number; downloadStatus?: string; }

export default function OfflineDownload() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getPendingCount, flush } = useSyncQueue();
  const [packages, setPackages] = useState<OfflinePackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [autoOffline, setAutoOffline] = useState(() => localStorage.getItem('bcsd_offline_mode') === 'true');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<OfflinePackage | null>(null);

  useEffect(() => { const on = () => setOnline(true); const off = () => setOnline(false); window.addEventListener('online', on); window.addEventListener('offline', off); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); }; }, []);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true); setDataError(null);
      const saved = JSON.parse(localStorage.getItem('bcsd_downloaded_packages') || '[]') as string[];
      const verified = new Set<string>();
      for (const id of saved) { const entry = await getPackageFromDB(id); if (entry) verified.add(id); }
      let available: OfflinePackageData[] = [];
      try { available = await getAvailableOfflinePackages(); } catch (error) { if (!cancelled) setDataError(error instanceof OfflineDataSourceError ? error.message : 'Không tải được dữ liệu offline từ API.'); }
      if (!cancelled) { setPackages(available.map((pkg) => ({ ...pkg, downloaded_at: verified.has(pkg.id) ? new Date().toLocaleDateString('vi-VN') : undefined }))); setPendingCount(getPendingCount()); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [getPendingCount]);
  useEffect(() => { const timer = window.setInterval(() => setPendingCount(getPendingCount()), 5000); return () => window.clearInterval(timer); }, [getPendingCount]);

  const handleDownload = useCallback(async (pkg: OfflinePackage) => {
    if (!online) return;
    setDownloadError(null);
    setPackages((prev) => prev.map((item) => item.id === pkg.id ? { ...item, downloadProgress: 5, downloadStatus: t('offline.downloading') } : item));
    let blob: Blob;
    try { blob = await downloadTourOfflinePackage(pkg.id); } catch { setPackages((prev) => prev.map((item) => item.id === pkg.id ? { ...item, downloadProgress: undefined, downloadStatus: undefined } : item)); setDownloadError('Tải gói thất bại từ API. Hãy kiểm tra backend.'); return; }
    try {
      await savePackageToDB(pkg.id, blob);
      const payload = JSON.parse(await blob.text()) as { media_urls?: string[] };
      const mediaUrls = payload.media_urls || [];
      if (mediaUrls.length) {
        setPackages((prev) => prev.map((item) => item.id === pkg.id ? { ...item, downloadProgress: 10, downloadStatus: `Đang tải 0/${mediaUrls.length} tệp...` } : item));
        await downloadMediaWithProgress(mediaUrls, (progress, currentUrl) => { const completed = Math.round(progress / 100 * mediaUrls.length); setPackages((prev) => prev.map((item) => item.id === pkg.id ? { ...item, downloadProgress: 10 + Math.round(progress * .9), downloadStatus: `Đang tải ${completed}/${mediaUrls.length} tệp: ${currentUrl.split('/').pop()}` } : item)); });
      }
    } catch { setPackages((prev) => prev.map((item) => item.id === pkg.id ? { ...item, downloadProgress: undefined, downloadStatus: undefined } : item)); setDownloadError('Đã tải dữ liệu nhưng lưu offline thất bại. Vui lòng kiểm tra bộ nhớ trình duyệt.'); return; }
    setPackages((prev) => { const updated = prev.map((item) => item.id === pkg.id ? { ...item, downloadProgress: undefined, downloadStatus: undefined, downloaded_at: new Date().toLocaleDateString('vi-VN') } : item); localStorage.setItem('bcsd_downloaded_packages', JSON.stringify(updated.filter((item) => item.downloaded_at).map((item) => item.id))); localStorage.setItem('bcsd_offline_mode', 'true'); return updated; });
  }, [online, t]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await deletePackageFromDB(deleteTarget.id).catch(() => undefined);
    setPackages((prev) => { const updated = prev.map((item) => item.id === deleteTarget.id ? { ...item, downloaded_at: undefined } : item); const ids = updated.filter((item) => item.downloaded_at).map((item) => item.id); localStorage.setItem('bcsd_downloaded_packages', JSON.stringify(ids)); if (!ids.length) localStorage.setItem('bcsd_offline_mode', 'false'); return updated; });
    setDeleteTarget(null);
  }, [deleteTarget]);
  const handleSync = async () => { if (!online || isSyncing) return; setIsSyncing(true); await flush(); setPendingCount(getPendingCount()); setIsSyncing(false); };
  const filtered = packages.filter((pkg) => !search || `${pkg.name} ${pkg.description}`.toLowerCase().includes(search.toLowerCase()));
  const downloaded = packages.filter((pkg) => pkg.downloaded_at);
  const usedStorage = downloaded.reduce((sum, pkg) => sum + Number(pkg.size_mb || 0), 0);
  const storageUsed = Math.min(100, usedStorage / 128 * 100);
  const sourceLabel = (pkg: OfflinePackage) => pkg.source_detail === 'tour-pois' ? 'API: TOUR_POIS' : 'API: TOURS_FALLBACK';

  const packageStatus = (pkg: OfflinePackage) => pkg.downloadProgress !== undefined ? t('offline.downloading') : pkg.downloaded_at ? t('offline.readyStatus') : pkg.is_premium && !pkg.is_unlocked ? 'Premium' : t('offline.download');
  const packageAction = (pkg: OfflinePackage) => {
    if (pkg.downloadProgress !== undefined) return <button className="sketch-btn sketch-btn-outline" disabled>{Math.round(pkg.downloadProgress)}%</button>;
    if (pkg.downloaded_at) return <button className="sketch-btn sketch-btn-danger" onClick={() => setDeleteTarget(pkg)}>{t('offline.delete')}</button>;
    if (pkg.is_premium && !pkg.is_unlocked) return <button className="sketch-btn sketch-btn-tertiary" onClick={() => navigate(`/tours/${pkg.id}`)}>{t('tour.unlock')}</button>;
    return <button className="sketch-btn sketch-btn-primary" disabled={!online} onClick={() => void handleDownload(pkg)}>{online ? t('offline.download') : 'Offline'}</button>;
  };

  const renderPackage = (pkg: OfflinePackage, index: number) => <article className={`offline-package ${pkg.downloaded_at ? 'is-ready' : ''}`} key={pkg.id}><div className="offline-package-index"><strong>{String(index + 1).padStart(2, '0')}</strong><span>{pkg.is_premium ? 'Premium' : 'Offline Pack'}</span></div><div className="offline-package-body"><div className="offline-package-top"><div className="offline-package-title"><h3>{pkg.name}</h3><p>{pkg.description}</p></div><span className={`sketch-chip ${pkg.downloaded_at ? 'sketch-chip-primary' : pkg.is_premium ? 'sketch-chip-tertiary' : 'sketch-chip-secondary'}`}>{packageStatus(pkg)}</span></div><div className="offline-package-meta"><span>{pkg.size_mb} MB</span><span>{String(pkg.poi_count).padStart(2, '0')} {t('common.locations')}</span><span>MP3 + Map + Images</span><span>{sourceLabel(pkg)}</span></div>{pkg.downloadProgress !== undefined ? <div className="offline-package-progress"><div className="offline-progress-copy"><strong>{pkg.downloadStatus}</strong><span>{Math.round(pkg.downloadProgress)}%</span></div><div className="offline-progress-track"><span style={{ width: `${pkg.downloadProgress}%` }} /></div><div className="offline-stage-track"><i className={pkg.downloadProgress >= 10 ? 'is-done' : ''} /><i className={pkg.downloadProgress >= 100 ? 'is-done' : ''} /></div></div> : pkg.downloaded_at ? <div className="offline-ready"><strong>{t('offline.readyStatus').toUpperCase()}</strong>Ngày {pkg.downloaded_at} · OK</div> : null}</div><div className="offline-package-action">{packageAction(pkg)}</div></article>;


  return <SketchFrame active="offline" className="offline-frame" searchPlaceholder="TÌM GÓI THUYẾT MINH OFFLINE..." searchValue={search} onSearchChange={setSearch} topRight={<button className="sketch-network-toggle" type="button" onClick={() => setOnline((value) => !value)}><span className={`sketch-live-dot ${online ? '' : 'is-offline'}`} />{online ? 'Online' : 'Offline mode'}</button>} routeMark={String(downloaded.length).padStart(2, '0')} routeTitle={`${downloaded.length} gói`} routeMeta={`${usedStorage.toFixed(1)} MB`} routeProgress={storageUsed} hideTopbar={true}><div className="offline-page"><header className="settings-topbar" style={{ paddingBottom: '16px', minHeight: 'auto', gap: '24px' }}><div><h1>{t('offline.title')}</h1><p>{t('offline.bannerDescription')}</p></div><span className="sketch-chip sketch-chip-secondary">{String(filtered.length).padStart(2, '0')} Gói</span></header>{(dataError || downloadError) && <div className="partner-error">{dataError || downloadError}</div>}<div className="offline-grid"><section className="offline-panel" style={{ borderTop: 'none' }}>{loading ? <div className="offline-empty">{t('common.loading')}</div> : filtered.length ? filtered.map(renderPackage) : <div className="offline-empty">Không tìm thấy gói phù hợp.</div>}</section><aside className="offline-side-stack"><section className="offline-auto"><div><strong>{t('offline.bannerTitle')}</strong><p>{t('offline.bannerDescription')}</p></div><button className={`offline-switch ${autoOffline ? 'is-on' : ''}`} type="button" aria-pressed={autoOffline} onClick={() => { const next = !autoOffline; setAutoOffline(next); localStorage.setItem('bcsd_offline_mode', String(next)); }}><span /></button></section>{pendingCount > 0 && <section className="offline-auto"><div><strong>{t('offline.syncPending', { count: pendingCount })}</strong><p>{isSyncing ? t('offline.syncing') : 'Đồng bộ nhật ký lên đám mây.'}</p></div><button className="sketch-btn sketch-btn-outline" type="button" disabled={isSyncing || !online} onClick={() => void handleSync()}>{isSyncing ? '...' : t('settings.execute')}</button></section>}</aside></div></div>{deleteTarget && <div className="offline-delete-overlay" role="dialog" aria-modal="true"><div className="offline-delete-modal"><div className="tour-modal-head"><h2>{t('offline.delete')} {deleteTarget.name}</h2><button className="sketch-icon-button" onClick={() => setDeleteTarget(null)} aria-label={t('common.close')}>×</button></div><div className="tour-modal-body"><p>{deleteTarget.name} ({deleteTarget.size_mb} MB)</p><div className="tour-modal-actions"><button className="sketch-btn sketch-btn-outline" onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</button><button className="sketch-btn sketch-btn-danger" onClick={() => void confirmDelete()}>{t('offline.delete')}</button></div></div></div></div>}</SketchFrame>;
}
