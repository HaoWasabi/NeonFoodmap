import { useTranslation } from 'react-i18next';
import type { Tour } from '../types';
import { useOfflineMedia } from '../hooks/useOfflineMedia';

interface TourCardProps {
    tour: Tour;
    isActive?: boolean;
    onClick?: () => void;
    onDetailClick?: (e: React.MouseEvent) => void;
}

export default function TourCard({ tour, isActive = false, onClick, onDetailClick }: TourCardProps) {
    const { t, i18n } = useTranslation();
    const poiCount = tour.pois.length;
    const duration = tour.estimated_duration_min;
    
    const { localUrl: coverImageUrl, isOffline: isCoverOffline } = useOfflineMedia(tour.cover_image_url);

    const handleDetailClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onDetailClick) onDetailClick(e);
    };

    const isPremium = tour.is_premium;
    const isLocked = isPremium && !tour.is_unlocked;

    return (
        <div
            onClick={onClick}
            className={`flex h-full flex-col gap-3 rounded-xl min-w-[220px] bg-white p-3 shadow-sm border cursor-pointer transition-all ${isActive
                ? 'border-primary/40 shadow-primary/10 shadow-md ring-2 ring-primary/20'
                : 'border-slate-100 hover:border-primary/20'
                } ${!tour.status ? 'opacity-60 pointer-events-none' : ''}`}
        >
            <div
                className="w-full aspect-video bg-center bg-no-repeat bg-cover rounded-lg bg-slate-200 flex items-center justify-center overflow-hidden relative"
                style={coverImageUrl ? { backgroundImage: `url(${coverImageUrl})` } : {}}
            >
                {isCoverOffline && (
                    <div className="absolute top-2 left-2 px-2 py-1 bg-black/50 backdrop-blur-md rounded-lg flex items-center gap-1 z-10">
                        <span className="material-symbols-outlined text-white text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>cloud_done</span>
                        <span className="text-[10px] text-white font-bold uppercase tracking-wider">Offline</span>
                    </div>
                )}
                {!coverImageUrl && (
                    <span className="material-symbols-outlined text-slate-300 text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>route</span>
                )}
                
                {/* Premium Badge */}
                {isPremium && (
                    <div className={`absolute bottom-2 left-2 px-2.5 py-1 rounded-lg flex items-center gap-1 z-10 ${
                        isLocked
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-lg shadow-amber-500/30'
                            : 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/30'
                    }`}>
                        <span className="material-symbols-outlined text-white text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                            {isLocked ? 'lock' : 'verified'}
                        </span>
                        <span className="text-[10px] text-white font-bold uppercase tracking-wider">
                            {isLocked ? 'Premium' : t('tour.unlocked', { defaultValue: 'Đã mở' })}
                        </span>
                    </div>
                )}

                {/* Detail Button Overlay */}
                <button 
                    onClick={handleDetailClick}
                    className="absolute top-2 right-2 size-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-slate-700 shadow-sm hover:bg-white active:scale-95 transition-all"
                >
                    <span className="material-symbols-outlined text-[20px]">info</span>
                </button>
            </div>
            <div>
                <div className="flex items-start justify-between">
                    <p className={`text-base font-bold leading-tight flex-1 ${isActive ? 'text-primary' : 'text-slate-900'}`}>
                        {tour.translated_name?.[i18n.language] || tour.name}
                    </p>
                </div>
                <div className="flex items-center justify-between mt-1">
                    <p className="text-slate-500 text-xs font-medium">
                        {duration ? `${duration} ${t('common.minutes')}` : '—'} • {poiCount} {t('common.locations')}
                    </p>
                    {isPremium && isLocked && tour.premium_price ? (
                        <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            {tour.premium_price.toLocaleString('vi-VN')}₫
                        </span>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
