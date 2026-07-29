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
                await new Promise(r => setTimeout(r, 200));
                await play();
            } catch {
                // Autoplay bị block — user sẽ nhấn nút play thủ công
            }
        };

        void startPlayback();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audioReady]);

    const getNarrationText = useCallback(() => {
        if (!partner) return '';
        return partner.translated_intro_text || partner.intro_text || '';
    }, [partner]);

    const getAudioForLanguage = useCallback((): PartnerIntroAudio | null => {
        if (!partner?.intro_audio?.length) return null;
        const userLang = localStorage.getItem('bcsd_language') || i18n.language || 'vi';
        const match = partner.intro_audio.find(a => a.language === userLang);
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
            await load(audio.file_url);
            void play();
        } else {
            const ttsUrl = await getPartnerTTSAudio(id, userLang);
            if (ttsUrl) {
                await load(ttsUrl);
                void play();
            } else {
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
    const mustTry = partner.menu_details?.must_try || [];
    const hasMustTry = mustTry.length > 0;

    return (
        <div className="min-h-dvh bg-background-light pb-safe">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-100 px-4 py-3">
                <div className="max-w-5xl mx-auto flex items-center gap-3">
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
                </div>
            </header>

            {/* Hero Banner — full width with gradient */}
            <div className="relative overflow-hidden bg-gradient-to-br from-primary/90 via-primary to-emerald-800">
                {/* Decorative circles */}
                <div className="absolute -top-20 -right-20 size-64 rounded-full bg-white/5" />
                <div className="absolute -bottom-16 -left-16 size-48 rounded-full bg-white/5" />
                <div className="absolute top-1/2 right-1/4 size-32 rounded-full bg-white/[.03]" />

                <div className="relative max-w-5xl mx-auto px-4 py-8 sm:py-12 lg:py-16">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                        <div className="size-20 sm:size-24 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0 ring-2 ring-white/20">
                            <span className="material-symbols-outlined text-white text-4xl sm:text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>restaurant</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
                                {partner.business_name}
                            </h2>
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                                {partner.address && (
                                    <div className="flex items-center gap-1.5 text-sm text-white/80">
                                        <span className="material-symbols-outlined text-sm text-white/60">location_on</span>
                                        <span>{partner.address}</span>
                                    </div>
                                )}
                                {partner.opening_hours && (
                                    <div className="flex items-center gap-1.5 text-sm text-white/80">
                                        <span className="material-symbols-outlined text-sm text-white/60">schedule</span>
                                        <span>{partner.opening_hours}</span>
                                    </div>
                                )}
                            </div>
                            {partner.poi_name && (
                                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm text-xs font-medium text-white/90">
                                    <span className="material-symbols-outlined text-xs">pin_drop</span>
                                    {partner.poi_name}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content — two-column on desktop */}
            <main className="max-w-5xl mx-auto px-4 py-6 lg:py-10">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 lg:gap-8">
                    {/* Left Column — primary content */}
                    <div className="space-y-6">
                        {/* Narration Section */}
                        {narrationText && (
                            <section className="bg-white rounded-2xl p-5 sm:p-7 shadow-sm border border-slate-100">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-primary text-lg">headphones</span>
                                    </div>
                                    <h3 className="text-base font-bold text-slate-900">
                                        {t('partner.narration', 'Thuyết minh')}
                                    </h3>
                                </div>

                                {/* Intro text */}
                                <p className="text-sm sm:text-[15px] text-slate-600 leading-relaxed mb-5">
                                    {narrationText}
                                </p>

                                {/* Audio Player */}
                                <div className="bg-gradient-to-r from-slate-50 to-slate-100/60 rounded-2xl p-4 sm:p-5 border border-slate-100">
                                    <button
                                        onClick={handlePlayNarration}
                                        className="w-full flex items-center gap-4 mb-3"
                                    >
                                        <div className={`size-12 rounded-full flex items-center justify-center transition-all shadow-lg ${isPlaying ? 'bg-primary text-white shadow-primary/30 scale-105' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}>
                                            <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                                                {isPlaying ? 'pause' : 'play_arrow'}
                                            </span>
                                        </div>
                                        <div className="flex-1 text-left">
                                            <span className="block text-sm font-bold text-slate-800">
                                                {isPlaying ? t('narration.pause', 'Tạm dừng') : t('narration.listen', 'Nghe thuyết minh')}
                                            </span>
                                            <span className="block text-xs text-slate-400 mt-0.5">
                                                {duration > 0 ? `${formatTime(currentTime)} / ${formatTime(duration)}` : t('narration.tapToListen', 'Nhấn để nghe')}
                                            </span>
                                        </div>
                                        {isPlaying && (
                                            <div className="flex items-end gap-[3px] h-5">
                                                {[1, 2, 3, 4].map(i => (
                                                    <div
                                                        key={i}
                                                        className="w-[3px] bg-primary rounded-full animate-pulse"
                                                        style={{
                                                            height: `${8 + Math.random() * 12}px`,
                                                            animationDelay: `${i * 0.15}s`,
                                                            animationDuration: '0.6s',
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </button>

                                    {/* Progress bar */}
                                    {duration > 0 && (
                                        <>
                                            <div
                                                className="relative w-full h-2 bg-slate-200 rounded-full cursor-pointer mb-3 group"
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
                                                <div
                                                    className="absolute top-1/2 -translate-y-1/2 size-3.5 bg-primary rounded-full shadow-md border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity"
                                                    style={{ left: `${progress}%`, transform: `translateX(-50%) translateY(-50%)` }}
                                                />
                                            </div>

                                            {/* Controls */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        onClick={() => rewind(10)}
                                                        className="px-2.5 py-1.5 text-xs font-bold text-slate-500 bg-white rounded-lg hover:bg-slate-50 transition-colors border border-slate-200"
                                                    >
                                                        −10s
                                                    </button>
                                                    <button
                                                        onClick={() => forward(10)}
                                                        className="px-2.5 py-1.5 text-xs font-bold text-slate-500 bg-white rounded-lg hover:bg-slate-50 transition-colors border border-slate-200"
                                                    >
                                                        +10s
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {PLAYBACK_RATES.map((rate) => (
                                                        <button
                                                            key={rate}
                                                            onClick={() => setPlaybackRate(rate)}
                                                            className={`px-2 py-1 text-xs font-bold rounded-lg transition-colors ${playbackRate === rate ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}
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
                        {hasMustTry && (
                            <section className="bg-white rounded-2xl p-5 sm:p-7 shadow-sm border border-slate-100">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="size-9 rounded-xl bg-amber-50 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-amber-600 text-lg">menu_book</span>
                                    </div>
                                    <h3 className="text-base font-bold text-slate-900">
                                        {t('partner.mustTry', 'Món nên thử')}
                                    </h3>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {mustTry.map((dish, idx) => (
                                        <div
                                            key={idx}
                                            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50/70 border border-slate-100 hover:border-primary/20 hover:bg-primary/[.02] transition-colors"
                                        >
                                            <span className="size-7 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-extrabold text-primary shrink-0">
                                                {idx + 1}
                                            </span>
                                            <span className="text-sm font-medium text-slate-700">{dish}</span>
                                        </div>
                                    ))}
                                </div>
                                {partner.menu_details?.price_range && (
                                    <div className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100">
                                        <span className="material-symbols-outlined text-sm text-emerald-600">payments</span>
                                        <span className="text-xs font-medium text-emerald-700">
                                            {t('partner.priceRange', 'Khoảng giá')}: <strong>{partner.menu_details.price_range}</strong>
                                        </span>
                                    </div>
                                )}
                            </section>
                        )}
                    </div>

                    {/* Right Column — sidebar content (QR, quick info) */}
                    <div className="space-y-6">
                        {/* Quick Info Card (desktop only — repeats key info for sidebar) */}
                        <section className="hidden lg:block bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                            <h4 className="text-sm font-bold text-slate-900 mb-4">{t('partner.businessSection', 'Thông tin cơ sở')}</h4>
                            <div className="space-y-3">
                                {partner.address && (
                                    <div className="flex items-start gap-3">
                                        <div className="size-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                                            <span className="material-symbols-outlined text-sm text-slate-500">location_on</span>
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Địa chỉ</p>
                                            <p className="text-sm text-slate-700 mt-0.5">{partner.address}</p>
                                        </div>
                                    </div>
                                )}
                                {partner.opening_hours && (
                                    <div className="flex items-start gap-3">
                                        <div className="size-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                                            <span className="material-symbols-outlined text-sm text-slate-500">schedule</span>
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{t('partner.openingHours', 'Giờ mở cửa')}</p>
                                            <p className="text-sm text-slate-700 mt-0.5">{partner.opening_hours}</p>
                                        </div>
                                    </div>
                                )}
                                {partner.poi_name && (
                                    <div className="flex items-start gap-3">
                                        <div className="size-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                                            <span className="material-symbols-outlined text-sm text-slate-500">pin_drop</span>
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Điểm tham quan</p>
                                            <p className="text-sm text-slate-700 mt-0.5">{partner.poi_name}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* QR Code */}
                        <section className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-100">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="size-9 rounded-xl bg-violet-50 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-violet-600 text-lg">qr_code</span>
                                </div>
                                <h3 className="text-base font-bold text-slate-900">
                                    {t('partner.qrCode', 'Mã QR')}
                                </h3>
                            </div>
                            <div className="flex flex-col items-center py-4">
                                <div id="partner-qr-container" className="p-5 bg-white rounded-2xl shadow-[0_0_0_1px_rgba(0,0,0,.04),0_8px_32px_rgba(0,0,0,.08)]">
                                    <QRCodeSVG
                                        value={partner.qr_url?.trim() || `${window.location.origin}/partner/${partner.id}`}
                                        size={200}
                                        bgColor="#ffffff"
                                        fgColor="#0f172a"
                                        level="M"
                                        includeMargin={false}
                                    />
                                </div>
                                <p className="mt-4 text-xs text-slate-400 text-center max-w-[240px] leading-relaxed">
                                    {t('partner.qrScanHint', 'Quét mã QR để xem thông tin quán')}
                                </p>
                                <button
                                    onClick={() => {
                                        const svg = document.querySelector('#partner-qr-container svg') as SVGElement | null;
                                        if (!svg) return;
                                        const svgData = new XMLSerializer().serializeToString(svg);
                                        const canvas = document.createElement('canvas');
                                        canvas.width = 400;
                                        canvas.height = 400;
                                        const ctx = canvas.getContext('2d');
                                        if (!ctx) return;
                                        const img = new Image();
                                        img.onload = () => {
                                            ctx.fillStyle = '#ffffff';
                                            ctx.fillRect(0, 0, 400, 400);
                                            ctx.drawImage(img, 100, 100, 200, 200);
                                            const link = document.createElement('a');
                                            link.download = `QR-${partner.business_name.replace(/\s+/g, '_')}.png`;
                                            link.href = canvas.toDataURL('image/png');
                                            link.click();
                                        };
                                        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                                    }}
                                    className="mt-4 flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-primary bg-primary/10 rounded-xl hover:bg-primary/20 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[18px]">download</span>
                                    {t('partner.downloadQr', 'Tải QR')}
                                </button>
                            </div>

                            {/* External link */}
                            {partner.qr_url && partner.qr_url.trim() && !partner.qr_url.includes('/partner/') && (
                                <a
                                    href={partner.qr_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 w-full py-3 px-4 mt-4 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 active:scale-[.97] transition-all"
                                >
                                    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>open_in_new</span>
                                    {t('partner.openLink', 'Mở link')}
                                </a>
                            )}
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
}
