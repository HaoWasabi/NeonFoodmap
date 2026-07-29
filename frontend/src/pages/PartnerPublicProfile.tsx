import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { getPartnerPublicProfile, getPartnerTTSAudio, type PartnerPublicProfile as PartnerProfile, type PartnerIntroAudio } from '../services/api';
import { QRCodeSVG } from 'qrcode.react';

const PLAYBACK_RATES = [0.8, 1, 1.5, 2];

function formatTime(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export default function PartnerPublicProfile() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();

    const [partner, setPartner] = useState<PartnerProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

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
        speakTTS,
    } = useAudioPlayer({});

    // Pre-load voices sớm để khi user nhấn play, Vietnamese voice đã sẵn sàng
    useEffect(() => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.getVoices();
        }
    }, []);

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        setError('');
        getPartnerPublicProfile(id)
            .then(setPartner)
            .catch(() => setError(t('common.error', 'Không tìm thấy đối tác')))
            .finally(() => setLoading(false));
    }, [id, i18n.language, t]);

    // Auto-play narration khi partner data load xong (giống POI tự phát khi mở)
    const autoPlayTriggered = useRef(false);
    const [audioReady, setAudioReady] = useState<string | null>(null);

    // Bước 1: Khi partner load xong, pre-fetch audio URL sẵn
    useEffect(() => {
        if (!partner || !id || autoPlayTriggered.current) return;
        autoPlayTriggered.current = true;

        const userLang = localStorage.getItem('bcsd_language') || i18n.language || 'vi';

        const prepareAudio = async () => {
            const audioMatch = partner.intro_audio?.find(a => a.language === userLang);
            let audioUrl = audioMatch?.file_url || '';

            if (!audioUrl) {
                const ttsUrl = await getPartnerTTSAudio(id, userLang);
                audioUrl = ttsUrl || '';
            }

            if (audioUrl) {
                setAudioReady(audioUrl);
            }
        };

        void prepareAudio();
    }, [partner, id, i18n.language]);

    // Bước 2: Khi có audio URL → load và tự động play
    useEffect(() => {
        if (!audioReady) return;

        const startPlayback = async () => {
            try {
                await load(audioReady);
                // Dùng globalAudio trực tiếp để play ngay (tránh race condition với state)
                await new Promise(r => setTimeout(r, 200));
                await play();
            } catch {
                // Autoplay bị block — bình thường khi truy cập trực tiếp URL
                // User sẽ nhấn nút play thủ công
            }
        };

        void startPlayback();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audioReady]);

    const getNarrationText = useCallback(() => {
        if (!partner) return '';
        // Ưu tiên translated_intro_text (đã dịch đúng ngôn ngữ user từ backend)
        // Fallback sang intro_text gốc
        return partner.translated_intro_text || partner.intro_text || '';
    }, [partner]);

    const getAudioForLanguage = useCallback((): PartnerIntroAudio | null => {
        if (!partner?.intro_audio?.length) return null;
        // Lấy ngôn ngữ hệ thống user đã chọn (localStorage > i18n.language > 'vi')
        const userLang = localStorage.getItem('bcsd_language') || i18n.language || 'vi';
        const match = partner.intro_audio.find(a => a.language === userLang);
        // Chỉ trả audio đúng ngôn ngữ, không fallback audio ngôn ngữ khác
        // (nếu không có, TTS sẽ đọc translated_intro_text bằng giọng đúng)
        return match || null;
    }, [partner, i18n.language]);

    const handlePlayNarration = useCallback(async () => {
        if (isPlaying) {
            pause();
            return;
        }

        if (duration > 0) {
            void play();
            return;
        }

        if (!id) return;

        const audio = getAudioForLanguage();
        const userLang = localStorage.getItem('bcsd_language') || i18n.language || 'vi';

        if (audio?.file_url) {
            // Có file audio upload sẵn → phát trực tiếp (giống POI)
            await load(audio.file_url);
            void play();
        } else {
            // Gọi backend sinh TTS audio bằng gTTS (giống cách POI có file audio)
            // Backend trả URL Cloudinary → load + play giống hệt POI narration
            const ttsUrl = await getPartnerTTSAudio(id, userLang);
            if (ttsUrl) {
                await load(ttsUrl);
                void play();
            } else {
                // Fallback cuối: Web Speech API (nếu backend TTS lỗi)
                const locales: Record<string, string> = {
                    vi: 'vi-VN', en: 'en-US', ja: 'ja-JP',
                    ko: 'ko-KR', zh: 'zh-CN', fr: 'fr-FR',
                    de: 'de-DE', es: 'es-ES', th: 'th-TH',
                };
                const textToSpeak = partner?.translated_intro_text || partner?.intro_text || '';
                if (textToSpeak) {
                    speakTTS(textToSpeak, locales[userLang] || 'vi-VN');
                }
            }
        }
    }, [isPlaying, duration, pause, play, id, getAudioForLanguage, i18n.language, load, partner, speakTTS]);

    if (loading) {
        return (
            <div className="flex h-dvh w-full items-center justify-center bg-background-light">
                <div className="flex flex-col items-center gap-3 animate-fade-in">
                    <div className="size-12 rounded-full border-[3px] border-primary border-t-transparent animate-spin" />
                    <p className="text-xs text-slate-400 font-medium">{t('common.loading', 'Đang tải...')}</p>
                </div>
            </div>
        );
    }

    if (error || !partner) {
        return (
            <div className="flex h-dvh w-full items-center justify-center bg-background-light">
                <div className="text-center p-6">
                    <span className="material-symbols-outlined text-5xl text-slate-300 mb-4 block">store_off</span>
                    <h2 className="text-lg font-bold text-slate-700 mb-2">{error || 'Không tìm thấy đối tác'}</h2>
                    <button
                        onClick={() => navigate(-1)}
                        className="mt-4 px-4 py-2 bg-primary text-white text-sm font-bold rounded-lg"
                    >
                        {t('common.back', 'Quay lại')}
                    </button>
                </div>
            </div>
        );
    }

    const narrationText = getNarrationText();
    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className="min-h-dvh bg-background-light pb-safe">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-100 px-4 py-3 flex items-center gap-3">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center justify-center size-9 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"
                    aria-label={t('common.back', 'Quay lại')}
                >
                    <span className="material-symbols-outlined text-lg text-slate-600">arrow_back</span>
                </button>
                <div className="flex-1 min-w-0">
                    <h1 className="text-sm font-bold text-slate-900 truncate">{partner.business_name}</h1>
                    {partner.poi_name && (
                        <p className="text-[10px] text-slate-400 truncate">@ {partner.poi_name}</p>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <main className="px-4 py-5 max-w-lg mx-auto space-y-5">
                {/* Hero Section */}
                <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                    <div className="flex items-start gap-4">
                        <div className="size-16 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-primary text-3xl">restaurant</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-lg font-bold text-slate-900">{partner.business_name}</h2>
                            {partner.address && (
                                <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                                    <span className="material-symbols-outlined text-xs">location_on</span>
                                    <span>{partner.address}</span>
                                </div>
                            )}
                            {partner.opening_hours && (
                                <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                                    <span className="material-symbols-outlined text-xs">schedule</span>
                                    <span>{partner.opening_hours}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* Narration Section */}
                {narrationText && (
                    <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="material-symbols-outlined text-primary text-lg">headphones</span>
                            <h3 className="text-sm font-bold text-slate-800">
                                {t('partner.narration', 'Thuyết minh')}
                            </h3>
                        </div>

                        {/* Intro text */}
                        <p className="text-sm text-slate-600 leading-relaxed mb-4">
                            {narrationText}
                        </p>

                        {/* Audio Player */}
                        <div className="bg-slate-50 rounded-xl p-4">
                            <button
                                onClick={handlePlayNarration}
                                className="w-full flex items-center gap-3 mb-3"
                            >
                                <div className={`size-10 rounded-full flex items-center justify-center transition-colors ${isPlaying ? 'bg-primary text-white' : 'bg-primary/10 text-primary'}`}>
                                    <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                                        {isPlaying ? 'pause' : 'play_arrow'}
                                    </span>
                                </div>
                                <div className="flex-1 text-left">
                                    <span className="block text-xs font-bold text-slate-700">
                                        {isPlaying ? t('narration.pause', 'Tạm dừng') : t('narration.listen', 'Nghe thuyết minh')}
                                    </span>
                                    <span className="block text-[10px] text-slate-400">
                                        {duration > 0 ? `${formatTime(currentTime)} / ${formatTime(duration)}` : t('narration.tapToListen', 'Nhấn để nghe')}
                                    </span>
                                </div>
                            </button>

                            {/* Progress bar */}
                            {duration > 0 && (
                                <>
                                    <div
                                        className="relative w-full h-1.5 bg-slate-200 rounded-full cursor-pointer mb-2"
                                        onClick={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const ratio = (e.clientX - rect.left) / rect.width;
                                            seek(ratio * duration);
                                        }}
                                    >
                                        <div
                                            className="absolute top-0 left-0 h-full bg-primary rounded-full transition-all"
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>

                                    {/* Controls */}
                                    <div className="flex items-center justify-between mt-2">
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => rewind(10)}
                                                className="px-2 py-1 text-[10px] font-bold text-slate-500 bg-slate-100 rounded hover:bg-slate-200 transition-colors"
                                            >
                                                −10s
                                            </button>
                                            <button
                                                onClick={() => forward(10)}
                                                className="px-2 py-1 text-[10px] font-bold text-slate-500 bg-slate-100 rounded hover:bg-slate-200 transition-colors"
                                            >
                                                +10s
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-0.5">
                                            {PLAYBACK_RATES.map((rate) => (
                                                <button
                                                    key={rate}
                                                    onClick={() => setPlaybackRate(rate)}
                                                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors ${playbackRate === rate ? 'bg-primary text-white' : 'text-slate-400 hover:bg-slate-100'}`}
                                                >
                                                    {rate}×
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </section>
                )}

                {/* Menu Highlights */}
                {partner.menu_details?.must_try && partner.menu_details.must_try.length > 0 && (
                    <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="material-symbols-outlined text-primary text-lg">menu_book</span>
                            <h3 className="text-sm font-bold text-slate-800">
                                {t('partner.mustTry', 'Món nên thử')}
                            </h3>
                        </div>
                        <div className="space-y-2">
                            {partner.menu_details.must_try.map((dish, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                    <span className="text-xs text-primary font-bold">{idx + 1}.</span>
                                    <span className="text-sm text-slate-700">{dish}</span>
                                </div>
                            ))}
                        </div>
                        {partner.menu_details.price_range && (
                            <p className="mt-3 text-xs text-slate-400">
                                {t('partner.priceRange', 'Khoảng giá')}: {partner.menu_details.price_range}
                            </p>
                        )}
                    </section>
                )}

                {/* QR Code hiện sẵn */}
                <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="material-symbols-outlined text-primary text-lg">qr_code</span>
                        <h3 className="text-sm font-bold text-slate-800">
                            {t('partner.qrCode', 'Mã QR')}
                        </h3>
                    </div>
                    <div className="flex flex-col items-center py-3">
                        <div id="partner-qr-container" className="p-4 bg-white rounded-2xl shadow-[0_0_0_1px_rgba(0,0,0,.06),0_4px_24px_rgba(0,0,0,.1)]">
                            <QRCodeSVG
                                value={partner.qr_url?.trim() || `${window.location.origin}/partner/${partner.id}`}
                                size={180}
                                bgColor="#ffffff"
                                fgColor="#0f172a"
                                level="M"
                                includeMargin={false}
                            />
                        </div>
                        <p className="mt-3 text-[11px] text-slate-400 text-center max-w-[200px] leading-relaxed">
                            {t('partner.qrScanHint', 'Quét mã QR để xem thông tin quán')}
                        </p>
                        <button
                            onClick={() => {
                                const svg = document.querySelector('#partner-qr-container svg') as SVGElement | null;
                                if (!svg) return;
                                const svgData = new XMLSerializer().serializeToString(svg);
                                const canvas = document.createElement('canvas');
                                canvas.width = 360;
                                canvas.height = 360;
                                const ctx = canvas.getContext('2d');
                                if (!ctx) return;
                                const img = new Image();
                                img.onload = () => {
                                    ctx.fillStyle = '#ffffff';
                                    ctx.fillRect(0, 0, 360, 360);
                                    ctx.drawImage(img, 90, 90, 180, 180);
                                    const link = document.createElement('a');
                                    link.download = `QR-${partner.business_name.replace(/\s+/g, '_')}.png`;
                                    link.href = canvas.toDataURL('image/png');
                                    link.click();
                                };
                                img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                            }}
                            className="mt-3 flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
                        >
                            <span className="material-symbols-outlined text-sm">download</span>
                            {t('partner.downloadQr', 'Tải QR')}
                        </button>
                    </div>

                    {/* Nút Mở link nếu partner có link bên ngoài (không phải deep-link app) */}
                    {partner.qr_url && partner.qr_url.trim() && !partner.qr_url.includes('/partner/') && (
                        <a
                            href={partner.qr_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-3 px-4 mt-3 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/30 active:scale-[.97] transition-transform"
                        >
                            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>open_in_new</span>
                            {t('partner.openLink', 'Mở link')}
                        </a>
                    )}
                </section>
            </main>
        </div>
    );
}
