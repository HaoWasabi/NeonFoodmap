import { useEffect, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { POI, Media } from '../types';
import { useAudioPlayer } from '../hooks/useAudioPlayer';

interface NarrationBottomSheetProps {
    poi: POI;
    media: Media | null;
    onClose: (duration: number) => void;
}

function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

const PLAYBACK_RATES = [0.8, 1, 1.5, 2];

export default function NarrationBottomSheet({ poi, media, onClose }: NarrationBottomSheetProps) {
    const { t, i18n } = useTranslation();
    const accumulatedDurationRef = useRef(0);

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

    // Load audio khi mount hoặc khi media/poi thay đổi
    useEffect(() => {
        const langCode = (media?.language || i18n.language || 'vi') as string;
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
    }, [poi.id, media, i18n.language]);



    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        seek(ratio * duration);
    };

    const handleClose = useCallback(() => {
        pause();
        onClose(accumulatedDurationRef.current + currentTime);
    }, [pause, onClose, currentTime]);

    const [isExpanded, setIsExpanded] = useState(true);
    const containerRef = useRef<HTMLElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                handleClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [handleClose]);

    return (
        <aside ref={containerRef} className={`fixed bottom-4 right-4 z-[9999] w-[calc(100vw-32px)] md:max-w-[440px] bg-[#191C1D] text-white shadow-2xl transition-all duration-500 ease-out flex flex-col ${isExpanded ? '' : 'translate-y-[calc(100%-62px)]'}`}>
            {/* Audio Summary Bar */}
            <div className="h-[62px] grid grid-cols-[62px_minmax(0,1fr)_96px_50px] border-b border-white/10 shrink-0">
                <button onClick={() => (isPlaying ? pause() : play())} className="border-r border-white/10 bg-[#006D38] hover:bg-[#004D28] text-white flex items-center justify-center transition-colors">
                    <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1", fontSize: '28px' }}>
                        {isPlaying ? 'pause' : 'play_arrow'}
                    </span>
                </button>
                <div className="min-w-0 px-3 py-2 flex flex-col justify-center">
                    <strong className="block whitespace-nowrap overflow-hidden text-ellipsis text-sm font-bold">{poi.translated_name || poi.name}</strong>
                    <span className="block whitespace-nowrap overflow-hidden text-ellipsis text-[10px] text-white/60 mt-1 uppercase tracking-wider">{formatTime(currentTime)} / {duration > 0 ? formatTime(duration) : '--:--'} · {media?.language || 'VI'}</span>
                </div>
                <div className="flex items-center gap-0.5 px-2 overflow-hidden">
                    {/* mini wave representation */}
                    {[...Array(8)].map((_, i) => (
                        <span key={i} className={`w-[2px] h-3 bg-white/30 ${isPlaying ? 'animate-pulse' : ''}`} style={{ animationDelay: `${i * 0.1}s` }} />
                    ))}
                </div>
                <button onClick={() => setIsExpanded(!isExpanded)} className="border-l border-white/10 bg-transparent hover:bg-white hover:text-[#191C1D] text-white flex items-center justify-center transition-colors">
                    <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>
                        {isExpanded ? 'expand_more' : 'expand_less'}
                    </span>
                </button>
            </div>

            {/* Audio Detail (Expanded State) */}
            <div className={`p-4 transition-opacity duration-300 ${isExpanded ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                <div className="flex justify-between items-end gap-3 mb-3">
                    <div>
                        <span className="block font-semibold text-[11px] tracking-widest uppercase text-white/60 mb-1">{t('narration.narrationPoint', 'Chương đang phát')}</span>
                        <h3 className="m-0 font-bold text-sm leading-tight">{poi.translated_name || poi.name}</h3>
                    </div>
                    <span className="font-mono text-[10px] text-white/60 tracking-wider">TTS · HQ</span>
                </div>

                <div className="group relative w-full h-[3px] bg-white/20 cursor-pointer mt-4 mb-2" onClick={handleSeek}>
                    <div className="absolute top-0 left-0 h-full bg-[#006D38]" style={{ width: `${progress}%` }} />
                    <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-[#006D38] border-2 border-white rounded-none opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `${progress}%`, transform: 'translate(-50%, -50%)' }} />
                </div>

                <div className="flex justify-between font-mono text-[10px] text-white/60 mb-3">
                    <span>{formatTime(currentTime)}</span>
                    <span>{duration > 0 ? formatTime(duration) : '--:--'}</span>
                </div>

                <div className="grid grid-cols-[auto_1fr] gap-3 items-center mt-3 pt-3 border-t border-white/10">
                    <div className="flex">
                        <button onClick={() => rewind(10)} className="w-10 h-9 border border-white/10 border-r-0 bg-transparent text-white font-extrabold text-[10px] hover:bg-white hover:text-[#191C1D] transition-colors">−10</button>
                        <button onClick={() => forward(10)} className="w-10 h-9 border border-white/10 bg-transparent text-white font-extrabold text-[10px] hover:bg-white hover:text-[#191C1D] transition-colors">+10</button>
                    </div>
                    <div className="flex justify-end">
                        {PLAYBACK_RATES.map((rate) => (
                            <button
                                key={rate}
                                onClick={() => setPlaybackRate(rate)}
                                className={`h-9 px-2 border border-white/10 border-r-0 last:border-r text-[10px] font-extrabold transition-colors ${playbackRate === rate ? 'bg-white text-[#191C1D]' : 'bg-transparent text-white hover:bg-white/10'}`}
                            >
                                {rate}×
                            </button>
                        ))}
                    </div>
                </div>

                {/* Close/Stop Button */}
                <button onClick={handleClose} className="w-full h-10 mt-3 border border-white/10 bg-transparent text-white text-[11px] font-bold uppercase tracking-widest hover:bg-[#006D38] hover:border-[#006D38] transition-colors flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check</span>
                    {t('narration.stopAndMark', 'Đóng & Đánh dấu hoàn tất')}
                </button>
            </div>
        </aside>
    );
}
