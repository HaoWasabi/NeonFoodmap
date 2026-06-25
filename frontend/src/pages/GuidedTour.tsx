import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, Circle, useMap, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';
import type { Tour, POI, Media, Partner, Language } from '../types';
import TourCard from '../components/TourCard';
import AppLayout from '../components/AppLayout';
import NarrationBottomSheet from '../components/NarrationBottomSheet';
import ReviewCard from '../components/ReviewCard';
import ReviewForm from '../components/ReviewForm';
import { GuidedTourSkeleton } from '../components/Skeleton';
import { staggerStyle } from '../components/Skeleton';
import PremiumTourCheckout from '../components/PremiumTourCheckout';
import { getTours } from '../services/api';
import { getOfflineToursFromPackages } from '../services/offlineStorage';
import { useGeolocation } from '../hooks/useGeolocation';
import { useGeofence } from '../hooks/useGeofence';
import { useNarrationEngine } from '../hooks/useNarrationEngine';
import { useTourReviews } from '../hooks/useTourReviews';
import { useApp } from '../context/AppContext';
import { unlockAudioAndTTS } from '../hooks/useAudioPlayer';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(L.Icon.Default.prototype as any)._getIconUrl = undefined;
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

// Custom icons
function createTourPOIIcon(index: number, status: 'completed' | 'current' | 'upcoming') {
    const colors = { completed: '#94a3b8', current: '#ff6a00', upcoming: '#cbd5e1' };
    const bg = colors[status];
    return L.divIcon({
        className: '',
        html: `<div style="width:36px;height:44px;display:flex;flex-direction:column;align-items:center">
      <div style="width:36px;height:36px;background:${bg};border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px ${bg}66;border:2.5px solid white;color:white;font-weight:800;font-size:14px">
        ${index + 1}
      </div>
      <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid ${bg};margin-top:-1px"></div>
    </div>`,
        iconSize: [36, 44],
        iconAnchor: [18, 44],
        popupAnchor: [0, -44],
    });
}

// Haversine distance
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Tính khoảng cách tới đường line nối POIs (point-to-line-segment distance)
function pointToSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    if (dx === 0 && dy === 0) return haversineDistance(px, py, ax, ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    return haversineDistance(px, py, ax + t * dx, ay + t * dy);
}

function getMinDistanceToRoute(lat: number, lng: number, routePoints: [number, number][]): number {
    let minDist = Infinity;
    for (let i = 0; i < routePoints.length - 1; i++) {
        const d = pointToSegmentDistance(lat, lng, routePoints[i][0], routePoints[i][1], routePoints[i + 1][0], routePoints[i + 1][1]);
        if (d < minDist) minDist = d;
    }
    return minDist;
}

// Component con để auto-fit bounds bản đồ
function FitBounds({ points }: { points: [number, number][] }) {
    const map = useMap();
    useEffect(() => {
        if (points.length > 0) {
            const bounds = L.latLngBounds(points.map(p => L.latLng(p[0], p[1])));
            map.fitBounds(bounds, { padding: [40, 40] });
        }
    }, [points, map]);
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

const OFF_ROUTE_THRESHOLD_M = 100; // cảnh báo khi đi chệch >100m

// Ước tính thời lượng TTS cho văn bản (trung bình 4 ký tự/giây)
function estimateTTSDuration(text: string): string {
    if (!text) return '0s';
    const totalSeconds = Math.ceil(text.length / 4);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) return `~${minutes}p ${seconds}s`;
    return `~${seconds}s`;
}

type POIStatus = 'completed' | 'current' | 'upcoming';

function getPOIStatus(index: number, currentIndex: number): POIStatus {
    if (index < currentIndex) return 'completed';
    if (index === currentIndex) return 'current';
    return 'upcoming';
}

export default function GuidedTour() {
    const { t, i18n } = useTranslation();
    const { user, openNarration, closeNarration, dispatch, narrationQueue } = useApp();
    const [tours, setTours] = useState<Tour[]>([]);
    const [selectedTour, setSelectedTour] = useState<Tour | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'route' | 'reviews'>('route');
    const [currentPOIIndex, setCurrentPOIIndex] = useState(0);
    const [tourStarted, setTourStarted] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showMap, setShowMap] = useState(false);
    const [offRoute, setOffRoute] = useState(false);
    const [showReviewForm, setShowReviewForm] = useState(false);
    const [showPremiumCheckout, setShowPremiumCheckout] = useState(false);
    const [narrationData, setNarrationData] = useState<{ poi: POI; media: Media | null; partners: Partner[] } | null>(null);
    const navigate = useNavigate();

    const { position, setMockLocation } = useGeolocation();
    const { reviews, stats, addReview } = useTourReviews(selectedTour?.id || '');

    const TABS = [
        { id: 'overview' as const, label: t('tour.tabOverview'), icon: 'info' },
        { id: 'route' as const, label: t('tour.tabRoute'), icon: 'route' },
        { id: 'reviews' as const, label: t('tour.tabReviews'), icon: 'star' },
    ];

    useEffect(() => {
        const timer = setTimeout(() => {
            getTours()
                .then((data) => {
                    if (data.length > 0) {
                        setTours(data);
                        setSelectedTour(data[0] ?? null);
                        return;
                    }

                    getOfflineToursFromPackages()
                        .then((offlineTours) => {
                            setTours(offlineTours);
                            setSelectedTour(offlineTours[0] ?? null);
                        })
                        .catch(() => {
                            setTours([]);
                            setSelectedTour(null);
                        });
                })
                .catch(async () => {
                    try {
                        const offlineTours = await getOfflineToursFromPackages();
                        setTours(offlineTours);
                        setSelectedTour(offlineTours[0] ?? null);
                    } catch {
                        setTours([]);
                        setSelectedTour(null);
                    }
                })
                .finally(() => setLoading(false));
        }, 600);
        return () => clearTimeout(timer);
    }, []);

    const orderedPOIs = useMemo(() => {
        if (!selectedTour) return [];
        return [...selectedTour.pois].sort((a, b) => a.sequence_order - b.sequence_order);
    }, [selectedTour]);

    // Tọa độ route line
    const routePoints = useMemo<[number, number][]>(() => {
        return orderedPOIs.map(tp => [tp.poi.latitude, tp.poi.longitude]);
    }, [orderedPOIs]);

    // POIs dạng flat array cho geofence
    const poisForGeofence = useMemo(() => orderedPOIs.map(tp => tp.poi), [orderedPOIs]);

    // Narration callbacks
    const handleNarrationReady = useCallback((poi: POI, media: Media | null, partners: Partner[]) => {
        setNarrationData({ poi, media, partners });
        openNarration(poi, media, partners);
    }, [openNarration]);

    const handleNarrationConflict = useCallback((newPoi: POI) => {
        dispatch({ type: 'PUSH_TO_QUEUE', payload: newPoi });
    }, [dispatch]);

    // Ref để tránh stale closure khi gọi triggerNarration từ useEffect
    const triggerNarrationRef = useRef<((poi: POI, type?: 'AUTO' | 'QR') => void) | null>(null);

    const { triggerNarration, finishNarration } = useNarrationEngine({
        language: (localStorage.getItem('bcsd_language') as Language) || user?.preferred_language || 'vi',
        voiceRegion: user?.preferred_voice_region || 'mien_nam',
        onNarrationReady: handleNarrationReady,
        onNarrationConflict: handleNarrationConflict,
    });

    // Cập nhật ref mỗi lần triggerNarration thay đổi
    triggerNarrationRef.current = triggerNarration;

    // ── Queue Auto-Play ──
    // Khi narrationData đóng (null) VÀ queue còn POI → tự động phát tiếp
    useEffect(() => {
        if (!tourStarted) return;              // Tour chưa bắt đầu → bỏ qua
        if (narrationData !== null) return;    // Đang phát → chờ
        if (narrationQueue.length === 0) return; // Queue trống → không làm gì

        const nextPoi = narrationQueue[0];
        console.log('[Tour] Queue auto-play: dequeue & trigger', nextPoi.name);

        // Delay nhỏ để NarrationBottomSheet unmount hoàn toàn (cleanup audio/TTS)
        // trước khi trigger narration mới
        const timer = setTimeout(() => {
            dispatch({ type: 'REMOVE_FROM_QUEUE' });
            // Dùng 'QR' để bypass anti-spam vì đây là queue intent
            triggerNarrationRef.current?.(nextPoi, 'QR');
        }, 300);

        return () => clearTimeout(timer);
    }, [narrationData, narrationQueue, tourStarted, dispatch]);






    // Geofence engine - tự động kích hoạt narration khi đi vào vùng POI
    useGeofence({
        pois: tourStarted ? poisForGeofence : [],
        position: position || null,
        onEnter: (poi) => {
            triggerNarration(poi, 'AUTO');
            // Tự động advance currentPOIIndex
            const idx = orderedPOIs.findIndex(tp => tp.poi.id === poi.id);
            if (idx >= 0 && idx >= currentPOIIndex) {
                setCurrentPOIIndex(idx + 1);
            }
        },
    });

    // Off-route detection
    useEffect(() => {
        if (!tourStarted || !position || routePoints.length < 2) {
            setOffRoute(false);
            return;
        }
        const dist = getMinDistanceToRoute(position.lat, position.lng, routePoints);
        setOffRoute(dist > OFF_ROUTE_THRESHOLD_M);
    }, [tourStarted, position, routePoints]);

    // Khoảng cách thực tế đến điểm tiếp theo
    const nextPOI: POI | undefined = orderedPOIs[currentPOIIndex]?.poi;
    const distanceToNext = useMemo(() => {
        if (!position || !nextPOI) return null;
        return Math.round(haversineDistance(position.lat, position.lng, nextPOI.latitude, nextPOI.longitude));
    }, [position, nextPOI]);

    const walkTimeMin = distanceToNext ? Math.max(1, Math.round(distanceToNext / 80)) : null; // ~80m/phút tốc độ đi bộ

    const handleNarrationClose = useCallback(async (duration: number) => {
        await finishNarration(duration);
        // Đóng UI narration. Nếu queue có POI tiếp theo,
        // useEffect [narrationData, narrationQueue] sẽ tự kích hoạt sau khi narrationData = null.
        setNarrationData(null);
        closeNarration();
    }, [finishNarration, closeNarration]);


    const handlePOIPopupOpen = useCallback((poi: POI) => {
        // Unlock NGAY LẬP TỨC từ event click của user
        unlockAudioAndTTS();
        
        // Mẹo cho Windows/Chrome: Phát 1 câu rỗng ngay lập tức để giữ quyền "User Gesture"
        if ('speechSynthesis' in window) {
            const silent = new SpeechSynthesisUtterance(' ');
            silent.volume = 0;
            window.speechSynthesis.speak(silent);
        }

        console.log('[Tour] Triggering narration for:', poi.name);
        triggerNarration(poi, 'AUTO');
    }, [triggerNarration]);

    if (loading) {
        return (
            <AppLayout title={t('tour.title')} headerAction={
                <button className="flex items-center justify-center size-10 rounded-full text-slate-400">
                    <span className="material-symbols-outlined text-xl">search</span>
                </button>
            }>
                <GuidedTourSkeleton />
            </AppLayout>
        );
    }

    if (!selectedTour) {
        return (
            <AppLayout
                title={t('tour.title')}
                headerAction={
                    <button className="flex items-center justify-center size-10 rounded-full text-slate-700 hover:bg-slate-100 tap-scale">
                        <span className="material-symbols-outlined text-xl">search</span>
                    </button>
                }
            >
                <div className="px-4 py-10 text-center">
                    <span className="material-symbols-outlined text-6xl text-slate-300 mb-3 block">hiking</span>
                    <p className="text-slate-600 font-semibold">{t('tour.noTours', { defaultValue: 'Chưa có tour khả dụng' })}</p>
                    <p className="text-slate-400 text-sm mt-1">{t('tour.tryAgainLater', { defaultValue: 'Vui lòng thử lại sau' })}</p>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout
            title={t('tour.title')}
            headerAction={
                <button className="flex items-center justify-center size-10 rounded-full text-slate-700 hover:bg-slate-100 tap-scale">
                    <span className="material-symbols-outlined text-xl">search</span>
                </button>
            }
        >
            {/* Tabs */}
            <div className="bg-white border-b border-slate-100 px-4 sticky top-0 z-10">
                <div className="flex gap-1">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 py-3 text-sm font-bold border-b-[3px] transition-all duration-200 tap-scale flex items-center justify-center gap-1.5 ${activeTab === tab.id
                                ? 'border-primary text-primary'
                                : 'border-transparent text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: activeTab === tab.id ? "'FILL' 1" : "'FILL' 0" }}>
                                {tab.icon}
                            </span>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Off-route Alert */}
            {offRoute && tourStarted && (
                <div className="mx-4 mt-3 animate-bounce-in">
                    <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-red-500 text-lg animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                        <p className="text-xs font-bold text-red-600 flex-1">{t('tour.offRoute')}</p>
                    </div>
                </div>
            )}

            {/* Next Stop Banner */}
            {tourStarted && nextPOI && (
                <div className="p-4 animate-fade-slide-up">
                    <div className="flex flex-col gap-3 rounded-2xl border border-primary\/20 bg-primary\/5 p-4">
                        <div className="flex items-center gap-2">
                            <div className="size-8 rounded-full bg-primary flex items-center justify-center animate-pulse-glow">
                                <span className="material-symbols-outlined text-white text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>near_me</span>
                            </div>
                            <div>
                                <p className="text-slate-900 text-sm font-bold">{t('tour.nextStop')}</p>
                                <p className="text-primary text-base font-bold">{nextPOI.translated_name || nextPOI.name}</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <p className="text-slate-500 text-xs">
                                {distanceToNext !== null && walkTimeMin !== null
                                    ? t('tour.distanceWalk', { distance: distanceToNext, time: walkTimeMin })
                                    : t('tour.distanceWalk', { distance: '—', time: '—' })
                                }
                            </p>
                            <button className="px-5 py-2 bg-primary text-white text-xs font-bold rounded-full shadow-lg shadow-primary\/20 tap-scale">
                                {t('tour.getDirections')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Tour Grid/Carousel */}
            <div className="py-4">
                <h3 className="text-slate-900 text-base font-bold px-4 pb-3">{t('tour.exploreTours')}</h3>
                <div className="px-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {tours.map((tour, i) => (
                            <div key={tour.id} className="animate-stagger-item" style={staggerStyle(i)}>
                                <TourCard
                                    tour={tour}
                                    isActive={selectedTour.id === tour.id}
                                    onClick={() => {
                                        setSelectedTour(tour);
                                        // Auto switch to route tab if not already
                                        if (activeTab === 'overview') setActiveTab('route');
                                    }}
                                    onDetailClick={() => navigate(`/tours/${tour.id}`)}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Route Tab */}
            {activeTab === 'route' && (
                <div className="px-4 pb-4 animate-fade-slide-up">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-slate-900 text-base font-bold">{t('tour.routeDetail')}</h3>
                        {orderedPOIs.length > 1 && (
                            <button
                                onClick={() => setShowMap(!showMap)}
                                className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary text-xs font-bold rounded-lg tap-scale"
                            >
                                <span className="material-symbols-outlined text-sm">{showMap ? 'list' : 'map'}</span>
                                {showMap ? t('tour.tabRoute') : t('tour.viewOnMap')}
                            </button>
                        )}
                    </div>

                    {/* Real Leaflet Map */}
                    {showMap && orderedPOIs.length > 0 ? (
                        <div className="relative w-full h-64 rounded-2xl overflow-hidden mb-6 border border-slate-200/60 shadow-inner">
                            <MapContainer
                                center={[orderedPOIs[0].poi.latitude, orderedPOIs[0].poi.longitude]}
                                zoom={16}
                                zoomControl={false}
                                style={{ height: '100%', width: '100%' }}
                            >
                                <TileLayer
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                />
                                <FitBounds points={routePoints} />

                                {/* Enable Map Click to mock GPS */}
                                {tourStarted && <MapClickInterceptor onMapClick={setMockLocation} />}

                                {/* Route Polyline */}
                                <Polyline
                                    positions={routePoints}
                                    pathOptions={{
                                        color: '#ff6a00',
                                        weight: 4,
                                        opacity: 0.8,
                                        dashArray: '8 6',
                                        lineCap: 'round',
                                    }}
                                />

                                {/* POI Markers */}
                                {orderedPOIs.map((tp, index) => {
                                    const status = getPOIStatus(index, currentPOIIndex);
                                    return (
                                        <Marker
                                            key={tp.poi.id}
                                            position={[tp.poi.latitude, tp.poi.longitude]}
                                            icon={createTourPOIIcon(index, status)}
                                            eventHandlers={{
                                                popupopen: () => handlePOIPopupOpen(tp.poi)
                                            }}
                                        >
                                            <Popup minWidth={200} maxWidth={280}>
                                                {(tp.poi.cover_image_url || tp.poi.image_url) && (
                                                    <div className="w-full h-32 mb-3 -mt-1 -mx-1 overflow-hidden" style={{ width: 'calc(100% + 8px)' }}>
                                                        <img
                                                            src={tp.poi.cover_image_url || tp.poi.image_url}
                                                            alt={tp.poi.name}
                                                            className="w-full h-full object-cover rounded-t-lg"
                                                        />
                                                    </div>
                                                )}
                                                <div className="text-sm font-semibold">{tp.poi.translated_name || tp.poi.name}</div>
                                                <div className="text-xs text-slate-600 mt-1 leading-relaxed line-clamp-3">
                                                    {(tp.poi.translated_description || tp.poi.description).slice(0, 150)}
                                                    {(tp.poi.translated_description || tp.poi.description).length > 150 ? '...' : ''}
                                                </div>
                                            </Popup>
                                        </Marker>
                                    );
                                })}

                                {/* Geofence circles */}
                                {orderedPOIs.map((tp) => (
                                    <Circle
                                        key={`gf-${tp.poi.id}`}
                                        center={[tp.poi.latitude, tp.poi.longitude]}
                                        radius={tp.poi.geofence_radius}
                                        pathOptions={{ color: '#ff6a00', fillColor: '#ff6a00', fillOpacity: 0.06, weight: 1, dashArray: '4 4' }}
                                    />
                                ))}

                                {/* User location */}
                                {position && (
                                    <Circle
                                        center={[position.lat, position.lng]}
                                        radius={12}
                                        pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.4, weight: 2 }}
                                    />
                                )}
                            </MapContainer>
                        </div>
                    ) : !showMap ? (
                        /* Mini icon map placeholder */
                        <div className="relative w-full h-44 rounded-2xl overflow-hidden mb-6 bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200/60 shadow-inner">
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="material-symbols-outlined text-slate-200 text-6xl animate-float">map</span>
                            </div>
                            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 400 200">
                                <path d="M60,140 Q150,100 200,160 T340,70" fill="none" stroke="#ff6a00" strokeDasharray="8 4" strokeLinecap="round" strokeWidth="3" opacity="0.7" />
                                {orderedPOIs.map((_, i) => {
                                    const cx = 60 + (280 / Math.max(orderedPOIs.length - 1, 1)) * i;
                                    const cy = i === 0 ? 140 : i === orderedPOIs.length - 1 ? 70 : 160;
                                    return <circle key={i} cx={cx} cy={cy} fill={i < currentPOIIndex ? '#94a3b8' : '#ff6a00'} r={i === currentPOIIndex ? 8 : 6} stroke="white" strokeWidth="2" className={i === currentPOIIndex ? 'animate-pulse' : ''} />;
                                })}
                            </svg>
                        </div>
                    ) : null}

                    {/* POI Timeline */}
                    <div>
                        {orderedPOIs.map((tp, index) => {
                            const status = getPOIStatus(index, currentPOIIndex);
                            const distToPOI = position ? Math.round(haversineDistance(position.lat, position.lng, tp.poi.latitude, tp.poi.longitude)) : null;
                            return (
                                <div
                                    key={tp.poi.id}
                                    className={`ml-3 pl-6 relative animate-stagger-item ${status === 'upcoming' ? 'border-l-2 border-dashed border-slate-200'
                                        : status === 'completed' ? 'border-l-2 border-slate-300'
                                            : 'border-l-2 border-primary'
                                        }`}
                                    style={staggerStyle(index)}
                                >
                                    <div className={`absolute -left-[9px] top-0 size-4 rounded-full border-[3px] ${status === 'completed' ? 'bg-slate-300 border-background-light'
                                        : status === 'current' ? 'bg-primary border-background-light animate-pulse-glow'
                                            : 'bg-slate-200 border-background-light'
                                        }`} />

                                    {status === 'current' ? (
                                        <div className="bg-white rounded-xl p-4 shadow-sm border border-primary\/20 mb-4 animate-fade-slide-left">
                                            <div className="flex items-center justify-between mb-2">
                                                <h4 className="text-slate-900 font-bold text-sm">
                                                    {index + 1}. {tp.poi.translated_name || tp.poi.name}
                                                </h4>
                                                <span className="material-symbols-outlined text-primary text-lg">expand_less</span>
                                            </div>
                                            <p className="text-slate-500 text-xs mb-3 leading-relaxed">
                                                {tp.poi.translated_description || tp.poi.description || t('tour.defaultDescription')}
                                            </p>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="px-2.5 py-1 bg-primary\/10 text-primary text-[10px] font-bold rounded-full">
                                                        {tp.poi.category === 'food' ? t('tour.categoryFood') : t('tour.categoryHistorical')}
                                                    </span>
                                                    <span className="text-[10px] text-primary font-medium flex items-center gap-0.5 bg-primary\/5 px-2 py-1 rounded-full border border-primary\/10">
                                                        <span className="material-symbols-outlined text-[12px]">headphones</span>
                                                        {estimateTTSDuration(tp.poi.description)}
                                                    </span>
                                                </div>
                                                {distToPOI !== null && (
                                                    <span className="text-[10px] text-slate-400 font-medium flex items-center gap-0.5">
                                                        <span className="material-symbols-outlined text-[10px]">location_on</span>
                                                        {distToPOI}m
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between pb-5">
                                            <div className="flex flex-col">
                                                <h4 className={`font-semibold text-sm ${status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                                    {index + 1}. {tp.poi.translated_name || tp.poi.name}
                                                </h4>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="flex items-center gap-0.5 text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
                                                        <span className="material-symbols-outlined text-[10px]">headphones</span>
                                                        {estimateTTSDuration(tp.poi.description)}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {distToPOI !== null && status === 'upcoming' && (
                                                    <span className="text-[10px] text-slate-300 font-medium">{distToPOI}m</span>
                                                )}
                                                <span className="material-symbols-outlined text-slate-300 text-lg">
                                                    {status === 'completed' ? 'check_circle' : 'expand_more'}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <div className="px-4 py-4 animate-fade-slide-up">
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                        <h3 className="text-lg font-bold text-slate-900 mb-2">
                            {selectedTour.translated_name?.[i18n.language] || selectedTour.name}
                        </h3>
                        <p className="text-slate-500 text-sm leading-relaxed">
                            {selectedTour.translated_description?.[i18n.language] || selectedTour.description}
                        </p>
                        <div className="flex gap-4 mt-4">
                            <div className="flex items-center gap-1.5 text-sm text-slate-500">
                                <span className="material-symbols-outlined text-primary text-base" style={{ fontVariationSettings: "'FILL' 1" }}>schedule</span>
                                {selectedTour.estimated_duration_min || '—'} {t('common.minutes')}
                            </div>
                            <div className="flex items-center gap-1.5 text-sm text-slate-500">
                                <span className="material-symbols-outlined text-primary text-base" style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
                                {selectedTour.pois.length} {t('common.points')}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Reviews Tab */}
            {activeTab === 'reviews' && (
                <div className="px-4 py-4 animate-fade-slide-up pb-20">
                    {/* Rating Stats Summary */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex gap-6 mb-6">
                        <div className="flex flex-col items-center justify-center min-w-[80px]">
                            <span className="text-4xl font-bold tracking-tighter text-slate-900">{stats.average.toFixed(1)}</span>
                            <div className="flex items-center gap-0.5 my-1">
                                {[1, 2, 3, 4, 5].map(star => (
                                    <span key={star} className={`text-[12px] material-symbols-outlined ${star <= Math.round(stats.average) ? 'text-amber-400' : 'text-slate-200'}`} style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                                ))}
                            </div>
                            <span className="text-xs font-medium text-slate-400">{stats.total} {t('tour.reviewsLabel', { defaultValue: 'đánh giá' })}</span>
                        </div>

                        <div className="flex-1 flex flex-col gap-1.5 pt-1">
                            {[5, 4, 3, 2, 1].map(stars => {
                                const count = stats.distribution[stars as 1 | 2 | 3 | 4 | 5];
                                const percent = stats.total > 0 ? (count / stats.total) * 100 : 0;
                                return (
                                    <div key={stars} className="flex items-center gap-2 text-xs">
                                        <span className="w-2 font-medium text-slate-500">{stars}</span>
                                        <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-amber-400 rounded-full transition-all duration-700" style={{ width: `${percent}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Action */}
                    <div className="flex items-center justify-between mb-4 px-1">
                        <h3 className="text-sm font-bold text-slate-900">{t('review.reviewCount', { count: stats.total, defaultValue: 'Bài đánh giá' })} ({stats.total})</h3>
                        <button
                            onClick={() => setShowReviewForm(true)}
                            className="text-primary text-xs font-bold px-4 py-2 bg-primary/10 rounded-full tap-scale"
                        >
                            {t('review.writeReview', { defaultValue: 'Viết đánh giá' })}
                        </button>
                    </div>

                    {/* Review List */}
                    {reviews.length > 0 ? (
                        <div className="flex flex-col gap-3">
                            {reviews.map((r, i) => (
                                <div key={r.id} style={staggerStyle(i)} className="animate-stagger-item">
                                    <ReviewCard review={r} />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-10 text-center text-slate-300 animate-fade-in">
                            <span className="material-symbols-outlined text-6xl block mb-3 animate-float drop-shadow-sm">rate_review</span>
                            <p className="text-sm font-medium text-slate-500">{t('tour.noReviews')}</p>
                            <p className="text-xs text-slate-400 mt-1">{t('tour.beFirstReview')}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Bottom CTA */}
            <div className="sticky bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background-light via-background-light/95 to-transparent">
                {selectedTour.is_premium && !selectedTour.is_unlocked ? (
                    <button
                        onClick={() => setShowPremiumCheckout(true)}
                        className="w-full flex items-center justify-center gap-2.5 rounded-2xl h-14 text-white text-base font-bold shadow-xl tap-scale transition-all bg-gradient-to-r from-amber-500 to-orange-500 shadow-amber-500/20"
                    >
                        <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
                        {t('tour.unlockNow')}
                        {selectedTour.premium_price ? (
                            <span className="text-sm opacity-80">— {selectedTour.premium_price.toLocaleString('vi-VN')}₫</span>
                        ) : null}
                    </button>
                ) : (
                    <button
                        onClick={() => { setTourStarted(!tourStarted); if (!tourStarted) setShowMap(true); }}
                        className={`w-full flex items-center justify-center gap-2.5 rounded-2xl h-14 text-white text-base font-bold shadow-xl tap-scale transition-all ${tourStarted
                            ? 'bg-slate-800 shadow-slate-800/20'
                            : 'bg-primary shadow-primary\/30 animate-pulse-glow'
                            }`}
                    >
                        <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                            {tourStarted ? 'stop_circle' : 'play_circle'}
                        </span>
                        {tourStarted ? t('tour.endTour') : t('tour.startTour')}
                    </button>
                )}
            </div>

            {/* Narration Bottom Sheet Overlay */}
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

            {/* Review Form Modal */}
            {/* Premium Checkout Modal */}
            {showPremiumCheckout && selectedTour.is_premium && (
                <PremiumTourCheckout
                    tour={selectedTour}
                    onClose={() => setShowPremiumCheckout(false)}
                    onSuccess={() => {
                        // Refresh tour list to update is_unlocked
                        getTours()
                            .then((data) => {
                                setTours(data);
                                const refreshed = data.find(t => t.id === selectedTour.id);
                                if (refreshed) setSelectedTour(refreshed);
                            })
                            .catch(() => {});
                    }}
                />
            )}

            {showReviewForm && (
                <ReviewForm
                    onClose={() => setShowReviewForm(false)}
                    onSubmit={async (rating, comment) => {
                        await addReview({
                            tour: Number(selectedTour.id),
                            rating,
                            comment,
                        } as any);
                        // Xóa cờ đã review để hiện popup cảm ơn (tùy chọn UI sau này)
                    }}
                />
            )}
        </AppLayout>
    );
}
