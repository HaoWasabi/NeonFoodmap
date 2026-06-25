import { useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { POI, Media, Partner } from '../types';
import PartnerCard from './PartnerCard';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { useOfflineMedia } from '../hooks/useOfflineMedia';

interface NarrationBottomSheetProps {
    poi: POI;
    media: Media | null;
    partners: Partner[];
    onClose: (duration: number) => void;
}

function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

const PLAYBACK_RATES = [0.8, 1, 1.5, 2];

export default function NarrationBottomSheet({ poi, media, partners, onClose }: NarrationBottomSheetProps) {
    const { t } = useTranslation();
    const accumulatedDurationRef = useRef(0);

    // Guard: partners luôn là array (API có thể trả về paginated object hoặc null)
    const safePartners = Array.isArray(partners) ? partners : [];

    const handlePOIEnded = useCallback((dur: number) => {
        accumulatedDurationRef.current += dur;
        onClose(accumulatedDurationRef.current);
    }, [onClose]);



    const { 
        isPlaying, 
        currentTime, 
        duration, 
        playbackRate, 
        load, 
        play, 
        pause, 
        seek, 
        rewind, 
        forward, 
        setPlaybackRate, 
        speakTTS 
    } = useAudioPlayer({
        onEnded: handlePOIEnded,
    });

    const { localUrl: poiImageUrl, isOffline: isPoiImageOffline } = useOfflineMedia(poi.cover_image_url || poi.image_url);

    // Load audio khi mount hoặc khi media/poi thay đổi
    useEffect(() => {
        if (!poi) return;

        // TTS language code mapping
        const langCode = (media?.language || localStorage.getItem('bcsd_language') || 'vi') as string;
        const locales: Record<string, string> = {
            vi: 'vi-VN', en: 'en-US', ja: 'ja-JP',
            ko: 'ko-KR', zh: 'zh-CN', fr: 'fr-FR',
            de: 'de-DE', es: 'es-ES', th: 'th-TH',
        };
        const ttsLocale = locales[langCode] || 'vi-VN';

        const triggerAutoPlay = async () => {
            console.log('[NarrationSheet] Triggering auto-play for:', poi.name);
            if (media?.file_url) {
                await load(media.file_url);
                play();
            } else {
                // Ưu tiên: tts_content (đã dịch) > poi.translated_description (đã dịch từ API) > poi.description (gốc)
                const textToSpeak = media?.tts_content?.trim() || poi.translated_description || poi.description;
                speakTTS(textToSpeak, ttsLocale);
            }
        };

        // Một chút delay nhỏ để đảm bảo UI/Audio Context đã sẵn sàng
        const timer = setTimeout(triggerAutoPlay, 100);
        return () => {
            clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [poi.id, media]);



    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        seek(ratio * duration);
    };

    const handleClose = () => {
        pause();
        onClose(accumulatedDurationRef.current + currentTime);
    };

    return (
        <div className="animate-slide-up bg-background-light w-full rounded-t-[32px] shadow-2xl flex flex-col max-h-[92dvh] overflow-y-auto">
            {/* Handle */}
            <div className="flex h-6 w-full items-center justify-center sticky top-0 bg-background-light/80 backdrop-blur-md z-10">
                <div className="h-1.5 w-12 rounded-full bg-primary/20" />
            </div>

            {/* POI Image + Title */}
            <div className="px-4 pb-2">
                {poiImageUrl && (
                    <div className="aspect-video w-full overflow-hidden rounded-xl mb-4 relative">
                        <img src={poiImageUrl} alt={poi.name} className="w-full h-full object-cover" />
                        {isPoiImageOffline && (
                            <div className="absolute top-2 left-2 px-2 py-1 bg-black/50 backdrop-blur-md rounded-lg flex items-center gap-1">
                                <span className="material-symbols-outlined text-white text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>cloud_done</span>
                                <span className="text-[10px] text-white font-bold uppercase tracking-wider">Offline</span>
                            </div>
                        )}
                    </div>
                )}
                {!poiImageUrl && (
                    <div className="aspect-video w-full bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl mb-4 flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary text-6xl" style={{ fontVariationSettings: "'FILL' 1" }}>restaurant</span>
                    </div>
                )}
                <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 mr-4">
                        <h1 className="text-[20px] font-bold text-slate-900 leading-tight">{poi.translated_name || poi.name}</h1>
                        <p className="text-sm font-medium text-primary mt-1 flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">near_me</span>
                            {t('narration.narrationPoint')}
                        </p>
                    </div>
                    <button onClick={handleClose} className="p-2 rounded-full bg-primary/10 text-primary flex-shrink-0">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* 📝 Main Introduction Text (Translated) */}
                <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100">
                    <p className="text-sm text-slate-700 leading-relaxed line-clamp-6">
                        {media?.tts_content?.trim() || poi.translated_description || poi.description}
                    </p>
                    {media?.tts_content && media.language !== 'vi' && (
                        <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1">
                                <span className="material-symbols-outlined text-[12px]">translate</span>
                                {media.language.toUpperCase()} {t('common.translated', { defaultValue: 'Translated' })}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Audio Player */}
            <div className="px-6 py-4 space-y-5">
                {/* Progress Bar */}
                <div className="space-y-2">
                    <div
                        className="relative w-full h-1.5 bg-primary/20 rounded-full overflow-visible cursor-pointer"
                        onClick={handleSeek}
                    >
                        <div className="absolute top-0 left-0 h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
                        {duration > 0 && (
                            <div
                                className="absolute top-1/2 -translate-y-1/2 size-4 bg-primary border-2 border-white rounded-full shadow-md"
                                style={{ left: `${progress}%`, transform: 'translateY(-50%) translateX(-50%)' }}
                            />
                        )}
                    </div>
                    <div className="flex justify-between text-xs font-semibold text-slate-500">
                        <span>{formatTime(currentTime)}</span>
                        <span>{duration > 0 ? formatTime(duration) : '--:--'}</span>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between">
                    <button onClick={() => rewind(10)} className="text-slate-600">
                        <span className="material-symbols-outlined text-[32px]">replay_10</span>
                    </button>
                    <button className="text-slate-400">
                        <span className="material-symbols-outlined text-[32px]">skip_previous</span>
                    </button>
                    <button
                        onClick={() => (isPlaying ? pause() : play())}
                        className="size-16 rounded-full bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/30"
                    >
                        <span className="material-symbols-outlined text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                            {isPlaying ? 'pause' : 'play_arrow'}
                        </span>
                    </button>
                    <button className="text-slate-400">
                        <span className="material-symbols-outlined text-[32px]">skip_next</span>
                    </button>
                    <button onClick={() => forward(10)} className="text-slate-600">
                        <span className="material-symbols-outlined text-[32px]">forward_10</span>
                    </button>
                </div>

                {/* Speed + Stop */}
                <div className="flex items-center justify-between gap-4">
                    <div className="flex bg-slate-200/50 p-1 rounded-lg">
                        {PLAYBACK_RATES.map((rate) => (
                            <button
                                key={rate}
                                onClick={() => setPlaybackRate(rate)}
                                className={`px-3 py-1 text-xs font-bold rounded ${playbackRate === rate ? 'bg-white text-primary shadow-sm' : 'text-slate-500'
                                    }`}
                            >
                                {rate}x
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={handleClose}
                        className="flex-1 py-3 px-4 bg-slate-900 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                    >
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        {t('narration.stopAndMark')}
                    </button>
                </div>
            </div>

            {/* Partner Suggestions */}
            {safePartners.length > 0 && (
                <div className="py-4 space-y-3">
                    <div className="px-4 flex justify-between items-center">
                        <h2 className="text-lg font-bold text-slate-900">{t('narration.nearbyFood')}</h2>
                        <button className="text-sm font-semibold text-primary">{t('common.viewAll')}</button>
                    </div>
                    <div className="flex overflow-x-auto gap-4 px-4 no-scrollbar pb-4">
                        {safePartners.map((p) => (
                            <PartnerCard key={p.id} partner={p} />
                        ))}
                    </div>
                </div>
            )}

            {/* 🌐 Original Text Toggle Option (optional show/hide) */}
            {media?.tts_content && media.language !== 'vi' && (
                <div className="mx-4 mb-4 rounded-xl border border-dashed border-slate-200 p-3 bg-slate-50/30">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                        🇻🇳 Văn bản gốc (Tiếng Việt)
                    </p>
                    <p className="text-xs text-slate-500 leading-relaxed italic line-clamp-2">{poi.description}</p>
                </div>
            )}

            <div className="h-6" />
        </div>
    );
}
