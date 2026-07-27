import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Language, Media, Partner, POI } from '../types';
import { useApp } from '../context/AppContext';
import { useGeolocation } from '../hooks/useGeolocation';
import { useGeofence } from '../hooks/useGeofence';
import { useNarrationEngine } from '../hooks/useNarrationEngine';
import { unlockAudioAndTTS } from '../hooks/useAudioPlayer';
import { getPOIsNearMe, getPOIById, resolveMapQrPoi } from '../services/api';
import { getOfflinePOIsFromPackages } from '../services/offlineStorage';
import QRScanOverlay from '../components/QRScanOverlay';
import FoodmapShell from '../components/FoodmapShell';
import InteractiveMap from '../components/InteractiveMap';
import CinematicPOIView from '../components/CinematicPOIView';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

const DEFAULT_CENTER: [number, number] = [10.7552, 106.7038];

export default function MapExplore() {
    const { t, i18n } = useTranslation();
    const { user, openNarration, closeNarration, dispatch, narrationQueue } = useApp();
    const [pois, setPois] = useState<POI[]>([]);
    const [showQR, setShowQR] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [activePoi, setActivePoi] = useState<POI | null>(null);
    const [closingPoi, setClosingPoi] = useState<POI | null>(null);
    const [narrationData, setNarrationData] = useState<{ poi: POI; media: Media | null; partners: Partner[] } | null>(null);
    const [isRecenterRequested, setIsRecenterRequested] = useState(false);
    const cinematicWrapperRef = useRef<HTMLDivElement>(null);
    const poisRequestIdRef = useRef(0);

    const location = useLocation();
    const navigate = useNavigate();
    const { position, permissionStatus, setMockLocation, isMocking } = useGeolocation();

    useEffect(() => {
        const loadOfflinePois = async () => {
            const offlinePois = await getOfflinePOIsFromPackages();
            if (offlinePois.length > 0) {
                setPois(offlinePois);
                dispatch({ type: 'SET_NEARBY_POIS', payload: offlinePois });
            }
        };
        void loadOfflinePois();
    }, [dispatch]);

    useEffect(() => {
        const requestId = ++poisRequestIdRef.current;
        let cancelled = false;
        const searchLat = position?.lat || DEFAULT_CENTER[0];
        const searchLng = position?.lng || DEFAULT_CENTER[1];
        const lang = (i18n.language || localStorage.getItem('bcsd_language') || user?.preferred_language || 'vi') as Language;
        const region = user?.preferred_voice_region || 'mien_nam';

        const applyPois = (data: POI[]) => {
            if (cancelled || requestId !== poisRequestIdRef.current) return;
            setPois(data);
            dispatch({ type: 'SET_NEARBY_POIS', payload: data });
        };

        const loadPois = async () => {
            try {
                const data = await getPOIsNearMe(searchLat, searchLng, lang, region);
                if (data.length > 0) {
                    applyPois(data);
                } else if (position) {
                    const fallback = await getPOIsNearMe(DEFAULT_CENTER[0], DEFAULT_CENTER[1], lang, region);
                    applyPois(fallback);
                }
            } catch (error) {
                if (cancelled || requestId !== poisRequestIdRef.current) return;
                console.error('[Map] getPOIsNearMe failed:', error);
                const offlinePois = await getOfflinePOIsFromPackages();
                applyPois(offlinePois);
            }
        };

        void loadPois();
        return () => { cancelled = true; };
        // Position changes intentionally refresh POIs around the current geofence context.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [position?.lat, position?.lng, user?.id, i18n.language]);

    const handleNarrationReady = useCallback((poi: POI, media: Media | null, partners: Partner[]) => {
        setActivePoi(poi);
        setNarrationData({ poi, media, partners: Array.isArray(partners) ? partners : [] });
        openNarration(poi, media, partners);
    }, [openNarration]);

    const handleNarrationConflict = useCallback((newPoi: POI) => {
        dispatch({ type: 'PUSH_TO_QUEUE', payload: newPoi });
    }, [dispatch]);

    const { triggerNarration, finishNarration, cancelNarration } = useNarrationEngine({
        language: (i18n.language || localStorage.getItem('bcsd_language') || user?.preferred_language || 'vi') as Language,
        voiceRegion: user?.preferred_voice_region || 'mien_nam',
        onNarrationReady: handleNarrationReady,
        onNarrationConflict: handleNarrationConflict,
    });

    const triggerNarrationRef = useRef<((poi: POI, type?: 'AUTO' | 'QR') => void) | null>(null);
    triggerNarrationRef.current = triggerNarration;

    useEffect(() => {
        const language = (i18n.language || localStorage.getItem('bcsd_language') || user?.preferred_language || 'vi') as Language;
        if (!activePoi || !narrationData || narrationData.poi.id !== activePoi.id || !narrationData.media) return;
        if (narrationData.media.language === language) return;

        // A language change must not keep playing the old locale's media.
        // Invalidate the old request, clear the current media, then fetch the
        // same POI again with the new language.
        const poi = activePoi;
        cancelNarration();
        setNarrationData(null);
        triggerNarrationRef.current?.(poi, 'QR');
    }, [activePoi, cancelNarration, i18n.language, narrationData, user?.preferred_language]);

    useEffect(() => {
        if (narrationData !== null || narrationQueue.length === 0) return;
        const nextPoi = narrationQueue[0];
        const timer = window.setTimeout(() => {
            dispatch({ type: 'REMOVE_FROM_QUEUE' });
            triggerNarrationRef.current?.(nextPoi, 'QR');
        }, 300);
        return () => window.clearTimeout(timer);
    }, [dispatch, narrationData, narrationQueue]);

    useEffect(() => {
        const state = location.state as { qrPOI?: POI } | null;
        if (!state?.qrPOI) return;
        unlockAudioAndTTS();
        setActivePoi(state.qrPOI);
        triggerNarration(state.qrPOI, 'QR');
        navigate('/map', { replace: true, state: {} });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.state]);

    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const poiId = searchParams.get('poi') || searchParams.get('id');
        const qrToken = searchParams.get('qr');
        if (!poiId) return;
        const load = qrToken ? () => resolveMapQrPoi(poiId, qrToken) : () => getPOIById(poiId);
        load()
            .then((poi) => {
                unlockAudioAndTTS();
                setActivePoi(poi);
                triggerNarration(poi, 'QR');
                navigate('/map', { replace: true, state: location.state });
            })
            .catch((error) => console.error('[Map] QR POI load failed:', error));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search]);

    const openPoi = useCallback((poi: POI, triggerType: 'AUTO' | 'QR' = 'AUTO') => {
        unlockAudioAndTTS();
        setActivePoi(poi);
        setClosingPoi(null);
        setSearchQuery('');
        setShowSearchResults(false);
        triggerNarration(poi, triggerType);
    }, [triggerNarration]);

    useGeofence({
        pois,
        position: position || null,
        onEnter: (poi) => openPoi(poi, 'AUTO'),
    });

    const handleNarrationClose = useCallback(async (duration: number) => {
        await finishNarration(duration);
        setNarrationData(null);
        if (activePoi) {
            setClosingPoi(activePoi);
        }
        setActivePoi(null);
        closeNarration();
    }, [activePoi, closeNarration, finishNarration]);

    useGSAP(() => {
        if (activePoi && cinematicWrapperRef.current) {
            // Opening transition: unclip from top edge and scale up
            gsap.fromTo(cinematicWrapperRef.current,
                { scale: 0.84, clipPath: 'inset(0 0 100% 0)', transformOrigin: 'top center' },
                { scale: 1, clipPath: 'inset(0 0 0% 0)', duration: 0.55, ease: 'power2.inOut' }
            );
        } else if (closingPoi && cinematicWrapperRef.current) {
            // Closing transition: scale down and clip up to reveal Map
            gsap.fromTo(cinematicWrapperRef.current,
                { scale: 1, clipPath: 'inset(0 0 0% 0)', transformOrigin: 'top center' },
                { scale: 0.84, clipPath: 'inset(0 0 100% 0)', duration: 0.55, ease: 'power2.inOut', onComplete: () => setClosingPoi(null) }
            );
        }
    }, [activePoi, closingPoi]);

    const filteredPOIs = useMemo(() => {
        const query = searchQuery.trim().toLocaleLowerCase('vi');
        if (!query) return pois.slice(0, 6);
        return pois.filter((poi) => `${poi.name} ${poi.translated_name || ''} ${poi.category}`.toLocaleLowerCase('vi').includes(query)).slice(0, 6);
    }, [pois, searchQuery]);

    const activeNarration = narrationData?.poi.id === activePoi?.id ? narrationData : null;
    const isMediaLoading = Boolean(activePoi && narrationData?.poi.id !== activePoi.id);
    const mediaProp = isMediaLoading ? undefined : (activeNarration?.media || null);
    const isClosing = Boolean(!activePoi && closingPoi);
    const mapPois = pois;
    const activeIndex = activePoi ? mapPois.findIndex((poi) => poi.id === activePoi.id) : -1;
    const previousPoi = activeIndex > 0 ? mapPois[activeIndex - 1] : mapPois.length > 1 ? mapPois[mapPois.length - 1] : undefined;
    const nextPoi = activeIndex >= 0 && activeIndex < mapPois.length - 1 ? mapPois[activeIndex + 1] : mapPois.length > 1 ? mapPois[0] : undefined;

    const handleMapClick = (lat: number, lng: number) => setMockLocation(lat, lng);
    const handleLocate = () => {
        setIsRecenterRequested(true);
        window.setTimeout(() => setIsRecenterRequested(false), 1000);
    };

    return (
        <FoodmapShell
            variant="map"
            hideAudio
            overlayOpen={Boolean(activePoi)}
            searchValue={searchQuery}
            searchPlaceholder={t('map.searchPlaceholder')}
            onSearchChange={(value) => {
                setSearchQuery(value);
                setShowSearchResults(value.trim().length > 0);
            }}
            onQrScan={() => setShowQR(true)}
            workspaceOverlay={(activePoi || closingPoi) ? (
                <div ref={cinematicWrapperRef} style={{ position: 'absolute', inset: 0, zIndex: 100 }}>
                    <CinematicPOIView
                        key={(activePoi || closingPoi)!.id}
                        poi={(activePoi || closingPoi)!}
                        media={mediaProp}
                        isClosing={isClosing}
                        partners={activeNarration?.partners || []}
                        previousPoi={previousPoi}
                        nextPoi={nextPoi}
                        onClose={handleNarrationClose}
                        onStartNarration={() => activeNarration ? undefined : openPoi((activePoi || closingPoi)!, 'QR')}
                        onNavigate={(poi) => openPoi(poi, 'QR')}
                    />
                </div>
            ) : null}
        >
            <div className="fmap002-hub">
                {showSearchResults && (
                    <div aria-label="Kết quả tìm kiếm" className="fmap002-search-results" role="listbox">
                        {filteredPOIs.length > 0 ? filteredPOIs.map((poi, index) => (
                            <button key={poi.id} className="fmap002-search-result-row" type="button" role="option" onClick={() => openPoi(poi, 'QR')}>
                                <span className="fmap002-result-index">{String(index + 1).padStart(2, '0')}</span>
                                <span className="fmap002-result-copy"><strong>{poi.translated_name || poi.name}</strong><span>{poi.category === 'food' ? t('tour.categoryFood') : t('tour.categoryHistorical')}</span></span>
                                <span className="fmap002-result-distance">{Math.round(poi.distance ?? 0)} M</span>
                            </button>
                        )) : <p className="fmap002-search-empty">{t('map.noPOIsFound', { defaultValue: 'Không tìm thấy địa điểm nào' })}</p>}
                    </div>
                )}

                <InteractiveMap
                    pois={mapPois}
                    position={position}
                    isMocking={isMocking}
                    permissionStatus={permissionStatus}
                    isRecenterRequested={isRecenterRequested}
                    onOpenPoi={(poi) => openPoi(poi, 'AUTO')}
                    onMapClick={handleMapClick}
                    onLocate={handleLocate}
                />

                <span className="fmap002-sr-status" aria-live="polite">{isMocking ? t('map.recording', { defaultValue: 'Đang mock vị trí' }) : permissionStatus === 'granted' ? t('map.recording') : permissionStatus === 'denied' ? t('map.gpsDenied') : t('map.waitingGps')}</span>
                {!navigator.onLine && <div className="fmap002-offline-indicator">{t('map.offlineMode')}</div>}

                {showQR && <QRScanOverlay onClose={() => setShowQR(false)} onScanSuccess={(poi) => { setShowQR(false); openPoi(poi, 'QR'); }} />}
            </div>
        </FoodmapShell>
    );
}
