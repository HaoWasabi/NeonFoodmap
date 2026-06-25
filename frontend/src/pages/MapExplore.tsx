import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from 'react-leaflet';
import { useLocation, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';
import type { POI } from '../types';
import { useApp } from '../context/AppContext';
import { useGeolocation } from '../hooks/useGeolocation';
import { useGeofence } from '../hooks/useGeofence';
import { useNarrationEngine } from '../hooks/useNarrationEngine';
import { unlockAudioAndTTS } from '../hooks/useAudioPlayer';
import { getPOIsNearMe, getPOIById, resolveMapQrPoi } from '../services/api';
import { getOfflinePOIsFromPackages } from '../services/offlineStorage';
import NarrationBottomSheet from '../components/NarrationBottomSheet';
import QRScanOverlay from '../components/QRScanOverlay';
import BottomNavBar from '../components/BottomNavBar';
import type { Media, Partner, Language } from '../types';

// Fix Leaflet default marker icons in Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(L.Icon.Default.prototype as any)._getIconUrl = undefined;
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

// Custom POI icons
function createPOIIcon(color: string, iconName: string) {
    return L.divIcon({
        className: '',
        html: `<div style="width:40px;height:48px;display:flex;flex-direction:column;align-items:center">
      <div style="width:40px;height:40px;background:${color};border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px ${color}66;border:2.5px solid white">
        <span class="material-symbols-outlined" style="color:white;font-size:20px;font-variation-settings:'FILL' 1">${iconName}</span>
      </div>
      <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${color};margin-top:-1px"></div>
    </div>`,
        iconSize: [40, 48],
        iconAnchor: [20, 48],
        popupAnchor: [0, -48],
    });
}

const FOOD_ICON = createPOIIcon('#ff6a00', 'restaurant');
const HISTORICAL_ICON = createPOIIcon('#dc2626', 'castle');
const CULTURAL_ICON = createPOIIcon('#7c3aed', 'museum');

function getPOIIcon(category: POI['category']) {
    switch (category) {
        case 'food': return FOOD_ICON;
        case 'historical': return HISTORICAL_ICON;
        default: return CULTURAL_ICON;
    }
}

// Component con để re-center map
function RecenterMap({ lat, lng, zoom }: { lat: number; lng: number; zoom?: number }) {
    const map = useMap();
    useEffect(() => { 
        map.setView([lat, lng], zoom ?? map.getZoom()); 
    }, [lat, lng, zoom, map]);
    return null;
}

// Component cho phép click mock tọa độ
function MapClickInterceptor({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
    useMapEvents({
        click(e) {
            onMapClick(e.latlng.lat, e.latlng.lng);
        }
    });
    return null;
}

function estimateTTSDuration(text: string): string {
    if (!text) return '0s';
    const totalSeconds = Math.ceil(text.length / 4);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) return `~${minutes}p ${seconds}s`;
    return `~${seconds}s`;
}


// Vĩnh Khánh street center: Q4, HCMC
const DEFAULT_CENTER: [number, number] = [10.7552, 106.7038];

export default function MapExplore() {
    const { t } = useTranslation();
    const { user, openNarration, closeNarration, dispatch, narrationQueue } = useApp();
    const [pois, setPois] = useState<POI[]>([]);
    const [showQR, setShowQR] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [narrationData, setNarrationData] = useState<{ poi: POI; media: Media | null; partners: Partner[] } | null>(null);
    const [isRecenterRequested, setIsRecenterRequested] = useState(false);
    const [selectedSearchPOI, setSelectedSearchPOI] = useState<POI | null>(null);
    const [showSearchResults, setShowSearchResults] = useState(false);

    // Đọc POI được truyền qua navigation state (từ QR scan ở trang khác)
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

        loadOfflinePois().catch(() => { /* ignore */ });
    }, [dispatch]);

    // Fetch POIs từ backend
    useEffect(() => {
        // Luôn fetch POIs tại Vĩnh Khánh nếu không có GPS, 
        // hoặc fetch theo GPS nếu có.
        const searchLat = position?.lat || DEFAULT_CENTER[0];
        const searchLng = position?.lng || DEFAULT_CENTER[1];
        
        // Ưu tiên ngôn ngữ từ localStorage (nguồn chính cho UI) trước khi dùng user state
        const lang = localStorage.getItem('bcsd_language') || user?.preferred_language || 'vi';
        const region = user?.preferred_voice_region || 'mien_nam';

        getPOIsNearMe(
            searchLat,
            searchLng,
            lang,
            region
        )
            .then((data) => {
                if (data.length > 0) {
                    setPois(data);
                    dispatch({ type: 'SET_NEARBY_POIS', payload: data });
                } else if (position) {
                    // Nếu ở vị trí hiện tại không có POI nào, hãy fetch lại ở Vĩnh Khánh để bản đồ không trống
                    getPOIsNearMe(DEFAULT_CENTER[0], DEFAULT_CENTER[1], lang, region)
                        .then(hcmData => {
                            setPois(hcmData);
                            dispatch({ type: 'SET_NEARBY_POIS', payload: hcmData });
                        });
                }
            })
            .catch(async (err) => {
                console.error('[Map] getPOIsNearMe failed:', err);
                const offlinePois = await getOfflinePOIsFromPackages();
                if (offlinePois.length > 0) {
                    setPois(offlinePois);
                    dispatch({ type: 'SET_NEARBY_POIS', payload: offlinePois });
                }
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [position?.lat, position?.lng, user?.id]);

    // Narration engine callbacks
    const handleNarrationReady = useCallback((poi: POI, media: Media | null, partners: Partner[]) => {
        setNarrationData({ poi, media, partners });
        openNarration(poi, media, partners);
    }, [openNarration]);

    const handleNarrationConflict = useCallback((newPoi: POI) => {
        dispatch({ type: 'PUSH_TO_QUEUE', payload: newPoi });
    }, [dispatch]);

    const { triggerNarration, finishNarration } = useNarrationEngine({
        language: (localStorage.getItem('bcsd_language') as Language) || user?.preferred_language || 'vi',
        voiceRegion: user?.preferred_voice_region || 'mien_nam',
        onNarrationReady: handleNarrationReady,
        onNarrationConflict: handleNarrationConflict,
    });

    // Ref để tránh stale closure khi gọi triggerNarration từ useEffect
    const triggerNarrationRef = useRef<((poi: POI, type?: 'AUTO' | 'QR') => void) | null>(null);
    triggerNarrationRef.current = triggerNarration;

    // ── Queue Auto-Play ──
    // Khi narrationData đóng (null) VÀ queue còn POI → tự động phát tiếp
    useEffect(() => {
        if (narrationData !== null) return;      // Đang phát → chờ
        if (narrationQueue.length === 0) return; // Queue trống

        const nextPoi = narrationQueue[0];
        console.log('[Map] Queue auto-play:', nextPoi.name);

        const timer = setTimeout(() => {
            dispatch({ type: 'REMOVE_FROM_QUEUE' });
            // Dùng 'QR' để bypass anti-spam vì đây là queue intent
            triggerNarrationRef.current?.(nextPoi, 'QR');
        }, 300);

        return () => clearTimeout(timer);
    }, [narrationData, narrationQueue, dispatch]);

    // Khi navigate về /map từ QR scan (QRScanOverlay gọi navigate với state.qrPOI)
    useEffect(() => {
        const state = location.state as { qrPOI?: POI } | null;
        if (state?.qrPOI) {
            unlockAudioAndTTS();
            triggerNarration(state.qrPOI, 'QR');
            // Xoá state để không trigger lại khi re-render
            navigate('/map', { replace: true, state: {} });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.state]);

    // Khi truy cập qua URL (vd: quét mã QR native browser -> /map?poi=8 hoặc /map?poi=8&qr=… có hiệu lực 1h)
    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const poiId = searchParams.get('poi') || searchParams.get('id');
        const qrToken = searchParams.get('qr');
        if (!poiId) return;

        const load =
            qrToken != null && qrToken.length > 0
                ? () => resolveMapQrPoi(poiId, qrToken)
                : () => getPOIById(poiId);

        load()
            .then((poi) => {
                unlockAudioAndTTS();
                triggerNarration(poi, 'QR');
                navigate('/map', { replace: true, state: location.state });
            })
            .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search]);

    // Geofence engine
    useGeofence({
        pois,
        position: position || null,
        onEnter: (poi) => {
            triggerNarration(poi, 'AUTO');
        },
    });

    const handlePOIPopupOpen = useCallback((poi: POI) => {
        // Unlock NGAY LẬP TỨC từ event click của user
        unlockAudioAndTTS();
        
        // Mẹo cho Windows/Chrome: Phát 1 câu rỗng ngay lập tức để giữ quyền "User Gesture"
        if ('speechSynthesis' in window) {
            const silent = new SpeechSynthesisUtterance(' ');
            silent.volume = 0;
            window.speechSynthesis.speak(silent);
        }

        console.log('[Map] Triggering narration for:', poi.name);
        // Sử dụng 'AUTO' để tôn trọng luật anti-spam (chỉ phát lần đầu hoặc sau 10p)
        triggerNarration(poi, 'AUTO');
    }, [triggerNarration]);

    const handleManualNarration = useCallback((poi: POI) => {
        unlockAudioAndTTS();
        // Sử dụng 'QR' để bypass anti-spam khi click nút thủ công
        triggerNarration(poi, 'QR');
    }, [triggerNarration]);

    const handleQRSuccess = useCallback((poi: POI) => {
        setShowQR(false);
        unlockAudioAndTTS();
        triggerNarration(poi, 'QR');
    }, [triggerNarration]);

    const handleNarrationClose = useCallback(async (duration: number) => {
        await finishNarration(duration);
        setNarrationData(null);
        closeNarration();
    }, [finishNarration, closeNarration]);

    const filteredPOIs = pois.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

    // Handle search result selection - center map on selected POI
    const handleSearchResultClick = useCallback((poi: POI) => {
        setSelectedSearchPOI(poi);
        setShowSearchResults(false);
        setSearchQuery('');
    }, []);

    return (
        <div className="relative flex h-dvh w-full flex-col overflow-hidden">
            {/* MAP LAYER */}
            <div className="absolute inset-0 z-0">
                <MapContainer
                    center={DEFAULT_CENTER}
                    zoom={17}
                    zoomControl={false}
                    style={{ height: '100%', width: '100%' }}
                    className="h-full w-full"
                >
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    />

                    {/* Re-center when GPS acquired or button pressed */}
                    {isRecenterRequested && position && (
                        <RecenterMap lat={position.lat} lng={position.lng} />
                    )}

                    {/* Re-center to selected search POI */}
                    {selectedSearchPOI && (
                        <RecenterMap lat={selectedSearchPOI.latitude} lng={selectedSearchPOI.longitude} zoom={18} />
                    )}

                    {/* Enable Map Click to mock GPS */}
                    <MapClickInterceptor onMapClick={setMockLocation} />

                    {/* Current user location */}
                    {position && (
                        <>
                            <Circle
                                center={[position.lat, position.lng]}
                                radius={15}
                                pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.3, weight: 2 }}
                            />
                            <Circle
                                center={[position.lat, position.lng]}
                                radius={60}
                                pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.08, weight: 1, dashArray: '4' }}
                            />
                        </>
                    )}

                    {/* POI Markers */}
                    {filteredPOIs.map((poi) => (
                        <React.Fragment key={`${poi.id}-${user?.preferred_language}`}>
                            <Marker
                                position={[poi.latitude, poi.longitude]}
                                icon={getPOIIcon(poi.category)}
                                eventHandlers={{ 
                                    popupopen: () => {
                                        console.log('[Map] Popup opened for:', poi.name);
                                        handlePOIPopupOpen(poi);
                                    }
                                }}
                            >
                                <Popup minWidth={220} maxWidth={300}>
                                    {(poi.cover_image_url || poi.image_url) && (
                                        <div className="w-full h-32 mb-3 -mt-1 -mx-1 overflow-hidden" style={{ width: 'calc(100% + 8px)' }}>
                                            <img
                                                src={poi.cover_image_url || poi.image_url}
                                                alt={poi.name}
                                                className="w-full h-full object-cover rounded-t-lg"
                                            />
                                        </div>
                                    )}
                                    <div className="text-sm font-semibold">{poi.translated_name || poi.name}</div>
                                    <div className="text-xs text-slate-600 mt-1 leading-relaxed line-clamp-4">
                                        {(poi.translated_description || poi.description).slice(0, 150)}
                                        {(poi.translated_description || poi.description).length > 150 ? '...' : ''}
                                    </div>
                                    <div className="mt-2 text-[10px] text-primary font-bold bg-primary/10 w-fit px-2 py-0.5 rounded-full inline-block">
                                        {poi.category === 'food' ? t('tour.categoryFood', { defaultValue: 'Ẩm thực' }) : t('tour.categoryHistorical', { defaultValue: 'Di tích' })}
                                    </div>
                                    <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                                        <div className="flex items-center gap-1 text-[10px] font-medium text-slate-500">
                                            <span className="material-symbols-outlined text-[14px]">headphones</span>
                                            {estimateTTSDuration(poi.translated_description || poi.description)}
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleManualNarration(poi);
                                            }}
                                            className="px-3 py-1.5 bg-primary text-white rounded-full text-xs font-bold active:scale-95 transition-transform shadow-sm"
                                        >
                                            {t('map.listenNarration')}
                                        </button>
                                    </div>
                                </Popup>
                            </Marker>
                            {/* Geofence visualization (Sibling) */}
                            <Circle
                                center={[poi.latitude, poi.longitude]}
                                radius={poi.geofence_radius}
                                pathOptions={{ color: '#ff6a00', fillColor: '#ff6a00', fillOpacity: 0.06, weight: 1, dashArray: '4 4' }}
                            />
                        </React.Fragment>
                    ))}
                </MapContainer>
            </div>

            {/* TOP HEADER */}
            <div className="relative z-20 flex flex-col gap-3 p-4 pt-safe mx-auto w-full max-w-2xl lg:max-w-4xl">
                {/* Status bar */}
                <div className="flex items-center justify-between rounded-xl bg-white/90 p-3 shadow-lg backdrop-blur-md">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary">
                            <span className={`material-symbols-outlined text-[20px] ${permissionStatus === 'granted' ? 'animate-pulse' : ''}`}>
                                {permissionStatus === 'granted' ? 'my_location' : 'location_disabled'}
                            </span>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{t('map.status')}</p>
                            <h2 className="text-sm font-bold leading-tight">
                                {isMocking ? t('map.recording', { defaultValue: 'Đang mock vị trí' }) : permissionStatus === 'granted' ? t('map.recording') : permissionStatus === 'denied' ? t('map.gpsDenied') : t('map.waitingGps')}
                            </h2>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100">
                            <span className="material-symbols-outlined">search</span>
                        </button>
                    </div>
                </div>
                {/* Search Bar */}
                <div className="flex h-12 w-full items-center gap-2 rounded-xl bg-white px-4 shadow-xl">
                    <span className="material-symbols-outlined text-slate-400">search</span>
                    <input
                        className="flex-1 border-none bg-transparent text-sm focus:outline-none placeholder:text-slate-400"
                        placeholder={t('map.searchPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setShowSearchResults(e.target.value.length > 0);
                        }}
                        onFocus={() => setShowSearchResults(searchQuery.length > 0)}
                    />
                    <div className="h-4 w-px bg-slate-200" />
                    <span className="material-symbols-outlined text-primary">mic</span>
                </div>

                {/* Search Results Panel */}
                {showSearchResults && filteredPOIs.length > 0 && (
                    <div className="max-h-64 w-full rounded-xl bg-white shadow-xl overflow-y-auto">
                        {filteredPOIs.map((poi) => (
                            <button
                                key={poi.id}
                                onClick={() => handleSearchResultClick(poi)}
                                className="w-full px-4 py-3 border-b border-slate-100 hover:bg-slate-50 active:bg-slate-100 transition-colors text-left flex items-start gap-3 last:border-b-0"
                            >
                                {poi.cover_image_url || poi.image_url ? (
                                    <img
                                        src={poi.cover_image_url || poi.image_url}
                                        alt=""
                                        className="w-12 h-12 object-cover rounded-lg flex-shrink-0"
                                    />
                                ) : (
                                    <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-slate-100 rounded-lg text-slate-400">
                                        <span className="material-symbols-outlined text-[20px]">
                                            {poi.category === 'food' ? 'restaurant' : 'castle'}
                                        </span>
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm text-slate-900 truncate">{poi.translated_name || poi.name}</p>
                                    <p className="text-xs text-slate-500 line-clamp-2">
                                        {(poi.translated_description || poi.description).slice(0, 80)}
                                        {(poi.translated_description || poi.description).length > 80 ? '...' : ''}
                                    </p>
                                </div>
                                {!(poi.cover_image_url || poi.image_url) && (
                                    <span className="material-symbols-outlined text-slate-300 text-[18px] flex-shrink-0 mt-1">
                                        chevron_right
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {/* No search results message */}
                {showSearchResults && filteredPOIs.length === 0 && searchQuery.length > 0 && (
                    <div className="w-full rounded-xl bg-white shadow-xl p-4 text-center">
                        <p className="text-sm text-slate-500">{t('map.noResults', { defaultValue: 'Không tìm thấy địa điểm nào' })}</p>
                    </div>
                )}
            </div>

            {/* FAB STACK */}
            <div className="relative z-20 mt-auto self-end flex flex-col items-end gap-3 px-4 pb-20">
                {/* Filter */}
                <button className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-slate-700 shadow-lg">
                    <span className="material-symbols-outlined">tune</span>
                </button>
                {/* My Location */}
                <button
                    onClick={() => { setIsRecenterRequested(true); setTimeout(() => setIsRecenterRequested(false), 1000); }}
                    className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-blue-600 shadow-lg"
                >
                    <span className="material-symbols-outlined">gps_fixed</span>
                </button>
                {/* QR Scan (Large) */}
                <button
                    onClick={() => setShowQR(true)}
                    className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white shadow-2xl shadow-primary/40 ring-4 ring-white"
                >
                    <span className="material-symbols-outlined text-[32px]">qr_code_scanner</span>
                </button>
            </div>

            {/* BOTTOM NAV */}
            <div className="relative z-20 w-full fixed bottom-0 left-0 right-0">
                <BottomNavBar />
            </div>

            {/* NARRATION BOTTOM SHEET OVERLAY */}
            {narrationData && (
                <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/20 backdrop-blur-sm">
                    <NarrationBottomSheet
                        key={narrationData.poi.id}
                        poi={narrationData.poi}
                        media={narrationData.media}
                        partners={narrationData.partners}
                        onClose={handleNarrationClose}
                    />
                </div>
            )}

            {/* QR SCAN OVERLAY */}
            {showQR && (
                <QRScanOverlay
                    onClose={() => setShowQR(false)}
                    onScanSuccess={handleQRSuccess}
                />
            )}

            {/* Offline indicator */}
            <div className="absolute top-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
                {!navigator.onLine && (
                    <div className="mt-2 px-4 py-1 bg-amber-500 text-white text-xs font-bold rounded-full shadow-lg">
                        {t('map.offlineMode')}
                    </div>
                )}
            </div>
        </div>
    );
}
