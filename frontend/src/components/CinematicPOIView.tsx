import { useEffect, useMemo, useRef, useState } from 'react';
import type { Media, Partner, POI } from '../types';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { useTranslation } from 'react-i18next';
import { useOfflineMedia } from '../hooks/useOfflineMedia';

interface CinematicPOIViewProps {
    poi: POI;
    media?: Media | null;
    isClosing?: boolean;
    partners: Partner[];
    previousPoi?: POI;
    nextPoi?: POI;
    onClose: (duration: number) => void;
    onStartNarration: () => void;
    onNavigate: (poi: POI) => void;
}

const PLAYBACK_RATES = [0.8, 1, 1.5, 2];

function formatTime(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function estimateDuration(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
}

function Icon({ name }: { name: 'back' | 'save' | 'play' | 'pause' | 'expand' | 'rewind' | 'forward' }) {
    const paths = {
        back: <path d="m15 5-7 7 7 7" />,
        save: <path d="M6 3h12v18l-6-4-6 4V3Z" />,
        play: <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none" />,
        pause: <><path d="M8 5h3v14H8zM14 5h3v14h-3z" fill="currentColor" stroke="none" /></>,
        expand: <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />,
        rewind: <path d="m11 7-5 5 5 5M18 7l-5 5 5 5" />,
        forward: <path d="m13 7 5 5-5 5M6 7l5 5-5 5" />,
    };
    return <svg className="fmap002-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

const getPlaceholders = (category: string) => {
    switch (category) {
        case 'food':
            return [
                'https://images.unsplash.com/photo-1555126634-323283e090fa?auto=format&fit=crop&w=1920&q=80',
                'https://images.unsplash.com/photo-1574484284002-952d92456975?auto=format&fit=crop&w=1920&q=80',
                'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1920&q=80',
                'https://images.unsplash.com/photo-1621510492985-1bd72db57eb6?auto=format&fit=crop&w=1920&q=80'
            ];
        case 'historical':
            return [
                'https://images.unsplash.com/photo-1558223944-88484a861614?auto=format&fit=crop&w=1920&q=80',
                'https://images.unsplash.com/photo-1534008897995-27a23e859048?auto=format&fit=crop&w=1920&q=80',
                'https://images.unsplash.com/photo-1603504381882-70b1cb3bfb5d?auto=format&fit=crop&w=1920&q=80',
                'https://images.unsplash.com/photo-1518177567086-4447abf461ea?auto=format&fit=crop&w=1920&q=80'
            ];
        case 'scenic':
            return [
                'https://images.unsplash.com/photo-1518177567086-4447abf461ea?auto=format&fit=crop&w=1920&q=80',
                'https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=1920&q=80',
                'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=1920&q=80',
                'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=1920&q=80'
            ];
        default:
            return [
                'https://images.unsplash.com/photo-1555126634-323283e090fa?auto=format&fit=crop&w=1920&q=80',
                'https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=1920&q=80',
                'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=1920&q=80',
                'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=1920&q=80'
            ];
    }
};

export default function CinematicPOIView({
    poi,
    media,
    isClosing,
    partners,
    onClose,
    onStartNarration,
}: CinematicPOIViewProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const { t, i18n } = useTranslation();
    const [progress, setProgress] = useState(0);
    const [expanded, setExpanded] = useState(false);
    const [saved, setSaved] = useState(() => localStorage.getItem(`nf-saved-poi-${poi.id}`) === 'true');
    const [voiceRegion, setVoiceRegion] = useState<'south' | 'north' | 'central'>('south');
    const narrative = media?.tts_content?.trim() || poi.translated_description || poi.description || '';
    
    const VOICE_REGIONS: Array<'south' | 'north' | 'central'> = ['south', 'north', 'central'];
    
    const { introText, chapter1Text, chapter2Text } = useMemo(() => {
        let intro = t('cinematicPOI.opening.defaultIntro');
        let ch1 = '';
        let ch2 = '';
        
        const paragraphs = narrative.split(/\n+/).map(p => p.trim()).filter(Boolean);
        if (paragraphs.length >= 3) {
            intro = paragraphs[0];
            ch1 = paragraphs[1];
            ch2 = paragraphs.slice(2).join('\n\n');
        } else if (paragraphs.length === 2) {
            intro = paragraphs[0];
            ch1 = paragraphs[1];
        } else if (paragraphs.length === 1) {
            const sentences = paragraphs[0].split(/(?<=[.?!])\s+/).filter(Boolean);
            if (sentences.length >= 3) {
                const third = Math.ceil(sentences.length / 3);
                intro = sentences.slice(0, third).join(' ');
                ch1 = sentences.slice(third, third * 2).join(' ');
                ch2 = sentences.slice(third * 2).join(' ');
            } else if (sentences.length === 2) {
                intro = sentences[0];
                ch1 = sentences[1];
            } else {
                intro = sentences[0] || intro;
            }
        }
        return { introText: intro, chapter1Text: ch1, chapter2Text: ch2 };
    }, [narrative, t]);

    const estimatedSeconds = estimateDuration(narrative);
    const { localUrl: coverUrl } = useOfflineMedia(poi.cover_image_url);
    const { localUrl: fallbackImageUrl } = useOfflineMedia(poi.image_url);
    const { isLoading, isPlaying, currentTime, duration, playbackRate, load, play, pause, seek, rewind, forward, setPlaybackRate, speakTTS } = useAudioPlayer();

    const poiName = poi.translated_name || poi.name;
    const category = t(`cinematicPOI.categories.${poi.category === 'food' ? 'food' : poi.category === 'historical' ? 'historical' : poi.category === 'scenic' ? 'scenic' : 'local'}`);
    
    const placeholders = useMemo(() => getPlaceholders(poi.category), [poi.category]);
    
    const isValidUrl = (url: unknown): url is string => typeof url === 'string' && url !== 'null' && url !== 'undefined' && url.trim() !== '';
    const validCover = isValidUrl(coverUrl) ? coverUrl : null;
    const validFallback = isValidUrl(fallbackImageUrl) ? fallbackImageUrl : null;

    const bgA = validCover ? `url("${validCover}"), url("${placeholders[0]}")` : (validFallback ? `url("${validFallback}"), url("${placeholders[0]}")` : `url("${placeholders[0]}")`);
    const bgB = validFallback ? `url("${validFallback}"), url("${placeholders[1]}")` : (validCover ? `url("${validCover}"), url("${placeholders[1]}")` : `url("${placeholders[1]}")`);
    const bgC = `url("${placeholders[2]}")`;
    const bgD = `url("${placeholders[3]}")`;

    const storyHeading = poiName;
    const titleSecondLine = t(`cinematicPOI.categoryTitles.${poi.category === 'food' ? 'food' : poi.category === 'historical' ? 'historical' : 'local'}`);
    const distance = Math.round(poi.distance ?? 45);
    const totalDuration = duration || estimatedSeconds;
    const partnersToRender = useMemo(() => (Array.isArray(partners) ? partners : []).slice(0, 3), [partners]);

    useEffect(() => {
        const node = scrollRef.current;
        if (!node) return;
        const handleScroll = () => {
            const max = Math.max(1, node.scrollHeight - node.clientHeight);
            setProgress(Math.min(1, node.scrollTop / max));
        };
        node.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();
        return () => node.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        if (isClosing) {
            pause();
            return;
        }
        if (media === undefined) return;
        if (!media && !narrative) return;
        let cancelled = false;
        const langCode = (media?.language || i18n.language || 'vi') as string;
        const locales: Record<string, string> = { vi: 'vi-VN', en: 'en-US', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', th: 'th-TH' };
        const locale = locales[langCode] || 'vi-VN';
        const start = async () => {
            if (media?.file_url) {
                await load(media.file_url);
                if (!cancelled) await play();
            } else if (!cancelled && narrative) {
                speakTTS(narrative, locale);
            }
        };
        const timer = window.setTimeout(() => { void start(); }, 150);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [isClosing, load, media, narrative, pause, play, speakTTS, i18n.language]);

    const toggleSave = () => {
        const next = !saved;
        setSaved(next);
        localStorage.setItem(`nf-saved-poi-${poi.id}`, String(next));
    };

    const close = () => {
        pause();
        onClose(currentTime);
    };

    const handlePlayPause = () => {
        if (isLoading) return;
        if (isPlaying) {
            pause();
        } else if (duration > 0 || isPlaying) {
            void play();
        } else {
            const langCode = (media?.language || i18n.language || 'vi') as string;
            const locales: Record<string, string> = { vi: 'vi-VN', en: 'en-US', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', th: 'th-TH' };
            const locale = locales[langCode] || 'vi-VN';
            if (media?.file_url) {
                void play();
            } else if (narrative) {
                speakTTS(narrative, locale);
            } else {
                onStartNarration();
            }
        }
    };

    return (
        <div ref={scrollRef} className="fmap002-poi-view" role="dialog" aria-label={`${t('cinematicPOI.aria.cinematicExperience')} ${poiName}`}>
            <div className="fmap002-scroll-progress" aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></div>
            <header className="fmap002-cinematic-toolbar">
                <button className="fmap002-poi-back" type="button" onClick={close}><Icon name="back" /><span>{t('cinematicPOI.toolbar.backToMap')}</span></button>
                <div className="fmap002-cinematic-toolbar-title"><span>{t('cinematicPOI.toolbar.exploring')}</span><strong>{poiName}</strong></div>
                <button className={`fmap002-poi-save${saved ? ' is-saved' : ''}`} type="button" onClick={toggleSave}><Icon name="save" /><span>{saved ? t('cinematicPOI.toolbar.saved') : t('cinematicPOI.toolbar.saveLocation')}</span></button>
            </header>

            <article className="fmap002-cinematic-story">
                <section className="fmap002-cinematic-scene fmap002-cinematic-opening is-visible" aria-label={t('cinematicPOI.aria.openingScene')}>
                    <div className="fmap002-cinematic-media fmap002-media-a" style={{ backgroundImage: bgA }} />
                    <div className="fmap002-cinematic-ink fmap002-ink-opening" />
                    <span className="fmap002-cinematic-burnin">{poi.latitude.toFixed(4)}°N · {poi.longitude.toFixed(4)}°E</span>
                    <div className="fmap002-opening-copy">
                        <span className="fmap002-cinematic-kicker">POI · {category.toLocaleUpperCase('vi')}</span>
                        <h1>{poiName.toLocaleUpperCase('vi')}<br />{titleSecondLine}</h1>
                        <p>{introText}</p>
                        <button className="fmap002-cinematic-listen" type="button" onClick={handlePlayPause} disabled={isLoading}>
                            {isLoading ? (
                                <><span className="fmap002-spinner" aria-hidden="true" style={{width: '1em', height: '1em', border: '2px solid currentColor', borderRightColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite'}} /><span>{t('cinematicPOI.audio.loading')}</span></>
                            ) : (
                                <><Icon name={isPlaying ? 'pause' : 'play'} /><span>{isPlaying ? t('cinematicPOI.audio.pauseNarration') : t('cinematicPOI.audio.startNarration')}</span></>
                            )}
                        </button>
                    </div>
                    <div className="fmap002-cinematic-ribbon">
                        <div><span>{t('cinematicPOI.metadata.distance')}</span><strong>{distance} M</strong></div>
                        <div><span>{t('cinematicPOI.metadata.category')}</span><strong>{category}</strong></div>
                        <div><span>{t('cinematicPOI.metadata.duration')}</span><strong>~ {formatTime(totalDuration)}</strong></div>
                        <div><span>{t('cinematicPOI.metadata.rating')}</span><strong>4.8 / 5</strong></div>
                    </div>
                    <span className="fmap002-cinematic-counter">01 / 06 · {distance} M</span>
                    <span className="fmap002-scroll-cue">{t('cinematicPOI.opening.scrollCue')}</span>
                </section>

                {chapter1Text && (
                    <section className="fmap002-cinematic-scene fmap002-cinematic-chapter fmap002-scene-copy-left is-visible" aria-label={t('cinematicPOI.aria.chapterOne')}>
                        <div className="fmap002-cinematic-media fmap002-media-b" style={{ backgroundImage: bgB }} />
                        <div className="fmap002-cinematic-ink fmap002-ink-side" />
                        <div className="fmap002-story-copy"><div className="fmap002-chapter-head"><span>{t('cinematicPOI.story.story01')}</span><span>{t('cinematicPOI.story.chapter01')}</span></div><h2>{storyHeading}</h2><p>{chapter1Text}</p></div>
                        <span className="fmap002-cinematic-caption">{t('cinematicPOI.story.caption')}</span>
                    </section>
                )}

                {chapter2Text && (
                    <section className="fmap002-cinematic-scene fmap002-cinematic-chapter fmap002-scene-copy-right is-visible" aria-label={t('cinematicPOI.aria.chapterTwo')}>
                        <div className="fmap002-cinematic-media fmap002-media-c" style={{ backgroundImage: bgC }} />
                        <div className="fmap002-cinematic-ink fmap002-ink-side" />
                        <div className="fmap002-story-copy"><div className="fmap002-chapter-head"><span>{t('cinematicPOI.story.storyPeople')}</span><span>{t('cinematicPOI.story.chapter02')}</span></div><p className="fmap002-story-lead">{chapter2Text}</p></div>
                    </section>
                )}

                <section className="fmap002-cinematic-scene fmap002-arrival-scene is-visible" aria-label={t('cinematicPOI.aria.arrivalInfo')}>
                    <div className="fmap002-cinematic-media fmap002-media-d" style={{ backgroundImage: bgD }} />
                    <div className="fmap002-cinematic-ink fmap002-ink-arrival" />
                    <div className="fmap002-arrival-copy"><span>{t('cinematicPOI.arrival.beforeYouArrive')}</span><h2>{t('cinematicPOI.arrival.instructions')}</h2><div className="fmap002-arrival-ledger"><div><span>{t('cinematicPOI.arrival.address')}</span><strong>{poi.address || t('cinematicPOI.arrival.updating')}</strong></div><div><span>{t('cinematicPOI.metadata.distance')}</span><strong>{distance} M</strong></div><div><span>{t('cinematicPOI.metadata.category')}</span><strong>{category}</strong></div><div><span>{t('cinematicPOI.arrival.access')}</span><strong>{t('cinematicPOI.arrival.accessMethods')}</strong></div></div></div>
                    <div className="fmap002-cinematic-audio-note"><span>{t('cinematicPOI.arrival.narrationNote')}</span><strong>{poiName} — {t('cinematicPOI.arrival.localStory')}</strong><span>{t('cinematicPOI.arrival.chapterFormat')} · {t('cinematicPOI.arrival.voiceFormat')} {t(`cinematicPOI.voiceRegions.${voiceRegion}`)} · {formatTime(totalDuration)}</span></div>
                </section>

                <section className="fmap002-cinematic-epilogue" aria-label={t('cinematicPOI.aria.partnersSection')}>
                    <div className="fmap002-epilogue-head"><div><span>{t('cinematicPOI.partners.heading')}</span><h2>{t('cinematicPOI.partners.continueStory')}</h2></div><span>{t('cinematicPOI.partners.ledger')} · {String(partnersToRender.length).padStart(2, '0')}</span></div>
                    <div className="fmap002-partners">
                        {partnersToRender.length > 0 ? partnersToRender.map((partner, index) => <div className="fmap002-partner-row" key={partner.id}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{partner.business_name}</strong><span>{partner.address || t('cinematicPOI.partners.withinWalkingDistance')}</span></div><small>{index === 0 ? t('cinematicPOI.partners.nearestOpen') : t('cinematicPOI.partners.withinWalkingDistance')}</small><button type="button" onClick={() => undefined}>{t('cinematicPOI.partners.qrMenu')}</button></div>) : <div className="fmap002-empty-partners">{t('cinematicPOI.partners.noPartners')}</div>}
                    </div>
                </section>
            </article>

            <aside className={`fmap002-corner-audio${expanded ? ' is-expanded' : ''}${isPlaying || isLoading ? ' is-playing' : ''}`} aria-label={t('cinematicPOI.aria.narrationControls')}>
                <div className="fmap002-audio-summary">
                    <button aria-label={isLoading ? t('cinematicPOI.audio.loading') : (isPlaying ? t('cinematicPOI.audio.pauseNarration') : t('cinematicPOI.audio.playNarration'))} className="fmap002-audio-main-play" type="button" onClick={handlePlayPause} disabled={isLoading}>
                        {isLoading ? <span className="fmap002-spinner" aria-hidden="true" style={{width: '1em', height: '1em', border: '2px solid currentColor', borderRightColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', display: 'block', margin: 'auto'}} /> : <Icon name={isPlaying ? 'pause' : 'play'} />}
                    </button>
                    <div className="fmap002-audio-summary-copy"><strong>{poiName} — {t('cinematicPOI.arrival.localStory')}</strong><span>{isLoading ? t('cinematicPOI.audio.loadingData') : `${formatTime(currentTime)} / ${formatTime(totalDuration)} · ${t('cinematicPOI.arrival.voiceFormat')} ${t(`cinematicPOI.voiceRegions.${voiceRegion}`)}`}</span></div>
                    <div className={`fmap002-mini-wave${isLoading ? ' is-loading' : ''}`} aria-hidden="true">{[8, 14, 24, 18, 30, 12, 22, 28, 16, 26, 10, 20, 32, 14, 24, 18, 29, 12, 21, 27].map((height, index) => <span key={index} style={{ height }} />)}</div>
                    <button aria-label={expanded ? t('cinematicPOI.audio.collapse') : t('cinematicPOI.audio.expand')} className="fmap002-audio-expand" type="button" onClick={() => setExpanded((value) => !value)}><Icon name="expand" /></button>
                </div>
                <div className="fmap002-audio-detail"><div className="fmap002-audio-chapter"><div><span>{t('cinematicPOI.audio.nowPlaying')}</span><h3>{poiName} — {t('cinematicPOI.arrival.localStory')}</h3></div><span>{t('cinematicPOI.audio.ttsHQ')}</span></div><input aria-label={t('cinematicPOI.aria.seekPosition')} type="range" min="0" max={totalDuration} value={Math.min(currentTime, totalDuration)} onChange={(event) => seek(Number(event.target.value))} /><div className="fmap002-audio-time"><span>{formatTime(currentTime)}</span><span>{formatTime(totalDuration)}</span></div><div className="fmap002-audio-control-row"><div><button type="button" onClick={() => rewind(10)}><Icon name="rewind" />−10</button><button type="button" onClick={() => forward(10)}><Icon name="forward" />+10</button></div><div className="fmap002-speed-group" aria-label={t('cinematicPOI.aria.playbackSpeed')}>{PLAYBACK_RATES.map((rate) => <button className={playbackRate === rate ? 'is-active' : ''} key={rate} type="button" onClick={() => setPlaybackRate(rate)}>{rate}×</button>)}</div></div><div className="fmap002-voice-switcher" aria-label={t('cinematicPOI.aria.voiceSelection')}>{VOICE_REGIONS.map((region) => <button className={voiceRegion === region ? 'is-active' : ''} key={region} type="button" onClick={() => setVoiceRegion(region)}>{t(`cinematicPOI.voiceRegions.${region}`)}</button>)}</div></div>
            </aside>
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes spin { 100% { transform: rotate(360deg); } }
                .fmap002-mini-wave.is-loading span { animation: pulse 1s infinite alternate; }
                @keyframes pulse { 0% { opacity: 0.2; transform: scaleY(0.5); } 100% { opacity: 1; transform: scaleY(1.2); } }
                .fmap002-cinematic-listen:disabled, .fmap002-audio-main-play:disabled { cursor: not-allowed; opacity: 0.7; }
            `}} />
        </div>
    );
}