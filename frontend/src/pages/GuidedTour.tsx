import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Circle, Polyline, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';
import type { Language, Media, Partner, POI, Tour, TourReview } from '../types';
import SketchFrame, { SketchIcon } from '../components/SketchFrame';
import ReviewForm from '../components/ReviewForm';
import PremiumTourCheckout from '../components/PremiumTourCheckout';
import NarrationBottomSheet from '../components/NarrationBottomSheet';
import { getTours } from '../services/api';
import { getOfflineToursFromPackages } from '../services/offlineStorage';
import { useGeolocation } from '../hooks/useGeolocation';
import { useGeofence } from '../hooks/useGeofence';
import { useNarrationEngine } from '../hooks/useNarrationEngine';
import { useTourReviews } from '../hooks/useTourReviews';
import { useApp } from '../context/AppContext';
import { unlockAudioAndTTS } from '../hooks/useAudioPlayer';

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointToSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return haversineDistance(px, py, ax, ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return haversineDistance(px, py, ax + t * dx, ay + t * dy);
}

function minRouteDistance(lat: number, lng: number, points: [number, number][]): number {
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) min = Math.min(min, pointToSegmentDistance(lat, lng, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]));
  return min;
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    const update = () => {
      map.invalidateSize();
      if (points.length) map.fitBounds(L.latLngBounds(points.map(([lat, lng]) => L.latLng(lat, lng))), { padding: [30, 30] });
    };
    const timer = window.setTimeout(update, 300);
    window.addEventListener('resize', update);
    return () => { window.clearTimeout(timer); window.removeEventListener('resize', update); };
  }, [map, points]);
  return null;
}

function MapClickInterceptor({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (event) => onMapClick(event.latlng.lat, event.latlng.lng) });
  return null;
}

function getPOIStatus(index: number, current: number): 'done' | 'current' | 'upcoming' {
  if (index < current) return 'done';
  if (index === current) return 'current';
  return 'upcoming';
}

function estimateAudio(text = ''): string {
  const seconds = Math.max(1, Math.ceil(text.length / 4));
  return seconds >= 60 ? `~${Math.floor(seconds / 60)}p ${seconds % 60}s` : `~${seconds}s`;
}

function createMarkerIcon(index: number) {
  return L.divIcon({ className: '', html: `<div style="width:30px;height:30px;background:#006D38;border:2px solid #191C1D;color:#fff;display:grid;place-items:center;font:400 14px Anton,sans-serif">${index + 1}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
}



export default function GuidedTour() {
  const { t, i18n } = useTranslation();
  const { user, openNarration, closeNarration, dispatch, narrationQueue } = useApp();
  const [tours, setTours] = useState<Tour[]>([]);
  const [selectedTour, setSelectedTour] = useState<Tour | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'route' | 'reviews'>('overview');
  const [currentPOIIndex, setCurrentPOIIndex] = useState(0);
  const [tourStarted, setTourStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showMap, setShowMap] = useState(false);
  const [showChooser, setShowChooser] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [showPremiumCheckout, setShowPremiumCheckout] = useState(false);
  const [panelRetracted, setPanelRetracted] = useState(false);
  const [mobilePanelRetracted, setMobilePanelRetracted] = useState(false);
  const [search, setSearch] = useState('');
  const [narrationData, setNarrationData] = useState<{ poi: POI; media: Media | null; partners: Partner[] } | null>(null);
  const { position, setMockLocation } = useGeolocation();
  const { reviews, stats, addReview } = useTourReviews(selectedTour?.id || '');
  const triggerNarrationRef = useRef<((poi: POI, type?: 'AUTO' | 'QR') => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      getTours().catch(() => getOfflineToursFromPackages()).then((data) => { if (!cancelled) { setTours(data); setSelectedTour(data[0] || null); } }).catch(() => { if (!cancelled) { setTours([]); setSelectedTour(null); } }).finally(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);

  const currentLang = (i18n.language || 'vi') as Language;
  const orderedPOIs = useMemo(() => selectedTour ? [...selectedTour.pois].sort((a, b) => a.sequence_order - b.sequence_order) : [], [selectedTour]);
  const routePoints = useMemo<[number, number][]>(() => orderedPOIs.map(({ poi }) => [poi.latitude, poi.longitude]), [orderedPOIs]);
  const poisForGeofence = useMemo(() => orderedPOIs.map(({ poi }) => poi), [orderedPOIs]);
  const nextPOI = orderedPOIs[currentPOIIndex]?.poi;
  const distanceToNext = position && nextPOI ? Math.round(haversineDistance(position.lat, position.lng, nextPOI.latitude, nextPOI.longitude)) : null;
  const offRoute = Boolean(tourStarted && position && routePoints.length > 1 && minRouteDistance(position.lat, position.lng, routePoints) > 100);
  const titleOf = (tour: Tour) => tour.translated_name?.[currentLang] || tour.translated_name?.vi || tour.name;
  const descriptionOf = (tour: Tour) => tour.translated_description?.[currentLang] || tour.translated_description?.vi || tour.description || '';
  const poiTitle = (poi: POI) => poi.translated_name || poi.name;

  const handleNarrationReady = useCallback((poi: POI, media: Media | null, partners: Partner[]) => { setNarrationData({ poi, media, partners }); openNarration(poi, media, partners); }, [openNarration]);
  const { triggerNarration, finishNarration } = useNarrationEngine({ language: (i18n.language || localStorage.getItem('bcsd_language') || user?.preferred_language || 'vi') as Language, voiceRegion: user?.preferred_voice_region || 'mien_nam', onNarrationReady: handleNarrationReady, onNarrationConflict: (poi) => dispatch({ type: 'PUSH_TO_QUEUE', payload: poi }) });
  useEffect(() => { triggerNarrationRef.current = triggerNarration; }, [triggerNarration]);
  useEffect(() => { if (!tourStarted || narrationData || narrationQueue.length === 0) return; const timer = window.setTimeout(() => { const poi = narrationQueue[0]; dispatch({ type: 'REMOVE_FROM_QUEUE' }); triggerNarrationRef.current?.(poi, 'QR'); }, 300); return () => window.clearTimeout(timer); }, [dispatch, narrationData, narrationQueue, tourStarted]);
  useGeofence({ pois: tourStarted ? poisForGeofence : [], position: position || null, onEnter: (poi) => { triggerNarration(poi, 'AUTO'); const idx = orderedPOIs.findIndex(({ poi: item }) => item.id === poi.id); if (idx >= currentPOIIndex) setCurrentPOIIndex(idx + 1); } });

  const startNarration = (poi: POI) => { unlockAudioAndTTS(); triggerNarration(poi, 'QR'); };
  const closeNarrationSheet = async (duration: number) => { await finishNarration(duration); setNarrationData(null); closeNarration(); };
  const selectTour = (tour: Tour) => { setSelectedTour(tour); setCurrentPOIIndex(0); setTourStarted(false); setShowChooser(false); };
  const primaryAction = () => {
    if (!selectedTour) return;
    if (selectedTour.is_premium && !selectedTour.is_unlocked) { setShowPremiumCheckout(true); return; }
    setTourStarted((value) => !value);
  };
  const filteredTours = tours.filter((tour) => !search || `${tour.name} ${descriptionOf(tour)}`.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <SketchFrame active="tours" searchPlaceholder="TÌM HÀNH TRÌNH HOẶC TRẠM..." hideTopbar={true}><div className="tour-page tour-loading"><div className="tour-loading-mark">NF</div><p>{t('tour.loadingTours')}</p></div></SketchFrame>;
  if (!selectedTour) return <SketchFrame active="tours" searchPlaceholder="TÌM HÀNH TRÌNH HOẶC TRẠM..." hideTopbar={true}><div className="tour-page tour-empty"><h1>{t('tour.noTours')}</h1><p>{t('tour.downloadOfflinePrompt')}</p></div></SketchFrame>;

  const completed = Math.min(currentPOIIndex, orderedPOIs.length);
  const progress = orderedPOIs.length ? Math.round(completed / orderedPOIs.length * 100) : 0;
  const tourMeta = `${String(orderedPOIs.length).padStart(2, '0')} ${t('tour.stopsLower')} · ${selectedTour.estimated_duration_min || 45} ${t('common.minutes')}`;


  const renderOverview = () => <>
    <div className="plan-head">
      <div className="plan-kicker">
        <div><span className={`sketch-chip ${selectedTour.is_premium ? 'sketch-chip-tertiary' : 'sketch-chip-secondary'}`} id="planBadge">{selectedTour.is_premium ? t('tour.premium') : t('tour.free')}</span></div>
        <button className="sketch-btn sketch-btn-text" id="changeTour" onClick={() => setShowChooser(true)}>{t('tour.changeTour')}</button>
      </div>
      <h1 className="plan-title" id="planTitle">{titleOf(selectedTour)}</h1>
      <p className="plan-intro" id="planIntro">{descriptionOf(selectedTour)}</p>
      <div className="metrics-line">
        <div className="metric"><span>{t('tour.length')}</span><strong id="metricDistance">1.8 KM</strong></div>
        <div className="metric"><span>{t('tour.time')}</span><strong id="metricTime">{selectedTour.estimated_duration_min || 45} {t('common.minutes').toUpperCase()}</strong></div>
        <div className="metric"><span>{t('tour.stops')}</span><strong id="metricStops">{String(orderedPOIs.length).padStart(2, '0')} {t('tour.stopsLower').toUpperCase()}</strong></div>
      </div>
      <button className="sketch-btn sketch-btn-primary plan-primary" id="primaryAction" onClick={primaryAction}>
        {selectedTour.is_premium && !selectedTour.is_unlocked ? t('tour.unlockTour') : tourStarted ? t('tour.endTour') : t('tour.continueTour')}
      </button>
    </div>
    <div className="plan-body">
      <div className="progress-block">
        <div className="progress-top">
          <strong id="progressCopy">{t('tour.completed')} {completed} {t('tour.outOf')} {orderedPOIs.length} {t('tour.stopsLower')}</strong>
          <span className="sketch-mono" id="progressPercent">{progress}%</span>
        </div>
        <div className="progress-track"><span id="progressBar" style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="section-label"><h2>{t('tour.currentStop')}</h2><button onClick={() => setActiveTab('route')}>{t('tour.openRouteTab')}</button></div>
      {nextPOI ? (
        <article className="focus-stop">
          <div className="focus-num" id="focusNum">{String(currentPOIIndex + 1).padStart(2, '0')}</div>
          <div className="focus-copy">
            <span className="sketch-label">{tourStarted ? t('tour.approaching') : t('tour.currentStop')}</span>
            <strong id="focusName">{poiTitle(nextPOI)}</strong>
            <span id="focusMeta">+{distanceToNext ?? '—'} M · AUDIO {estimateAudio(nextPOI.description)}</span>
          </div>
          <button className="sketch-icon-button focus-play" aria-label={t('qr.previewButton', { defaultValue: 'Nghe thử' })} onClick={() => startNarration(nextPOI)}>
            <SketchIcon name="play" />
          </button>
        </article>
      ) : <p className="tour-intro">{t('tour.allCompleted')}</p>}
      <div className="tour-section-label"><h2>{t('tour.upNext')}</h2></div>
      <div className="next-list" id="nextList">
        {orderedPOIs.slice(currentPOIIndex + 1, currentPOIIndex + 3).map((item, offset) => (
          <div className="next-row" key={item.poi.id}>
            <span className="next-row-num">{String(currentPOIIndex + offset + 2).padStart(2, '0')}</span>
            <div>
              <strong>{poiTitle(item.poi)}</strong>
              <span>{item.poi.category} · {estimateAudio(item.poi.description)}</span>
            </div>
            <span className="next-row-end">{distanceToNext ? `+${distanceToNext} M` : 'UPCOMING'}</span>
          </div>
        ))}
      </div>
    </div>
  </>;


  const renderRoute = () => <>
    <div className="route-tab-head">
      <h2>Lộ trình chi tiết</h2>
      <p id="ledgerTitle">{titleOf(selectedTour)} · {orderedPOIs.length} trạm</p>
    </div>
    <div className="ledger-scroll" id="ledgerList">
      {orderedPOIs.map((item, index) => {
        const status = getPOIStatus(index, currentPOIIndex);
        const locked = Boolean(selectedTour.is_premium && !selectedTour.is_unlocked && index > 0);
        return (
          <article className={`ledger-row ${locked ? 'locked' : status}`} key={item.poi.id}>
            <span className="ledger-no">{String(index + 1).padStart(2, '0')}</span>
            <div className="ledger-copy">
              <strong>{poiTitle(item.poi)}</strong>
              <span>{item.poi.category} · {estimateAudio(item.poi.description)}</span>
            </div>
            <div className="ledger-end">
              {locked ? <button className="sketch-btn sketch-btn-tertiary" onClick={() => setShowPremiumCheckout(true)}>Mở khóa</button>
                : status === 'current' ? <button className="sketch-btn sketch-btn-primary" onClick={() => startNarration(item.poi)}>Phát</button>
                  : status === 'done' ? '✓' : `${index * 120 + 180} M`}
            </div>
          </article>
        );
      })}
    </div>
  </>;


  const renderReviews = () => <>
    <div className="review-tab-head">
      <h2>Đánh giá du khách</h2>
      <p>Tín hiệu chất lượng từ những người đã hoàn thành hành trình.</p>
    </div>
    <div className="review-scroll" data-review-content>
      <div className="rating-overview">
        <div className="rating-score">
          <strong>{stats.average.toFixed(1)}</strong>
          <span>NGOÀI {stats.total} ĐÁNH GIÁ</span>
        </div>
        <div className="rating-bars">
          {[5, 4, 3, 2, 1].map((star) => {
            const value = stats.total ? stats.distribution[star as 1 | 2 | 3 | 4 | 5] / stats.total * 100 : 0;
            return (
              <div className="rating-bar" key={star}>
                <span>{star}</span>
                <div className="rating-track"><i style={{ width: `${value}%` }} /></div>
                <span>{Math.round(value)}%</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="review-ledger">
        {reviews.length ? (
          reviews.map((review: TourReview) => (
            <article className="review-row" key={review.id}>
              <div className="review-row-head">
                <strong>{review.username}</strong>
                <time>{new Date(review.created_at).toLocaleDateString('vi-VN', { day: 'numeric', month: 'short', year: 'numeric' })}</time>
              </div>
              <div className="review-stars">{'★'.repeat(Math.max(1, Math.min(5, review.rating)))}</div>
              {review.comment && <p>{review.comment}</p>}
            </article>
          ))
        ) : (
          <p className="plan-intro" style={{ marginTop: 15 }}>Chưa có đánh giá.</p>
        )}
      </div>
      <div className="review-cta">
        <button className="sketch-btn sketch-btn-outline" style={{ width: '100%' }} onClick={() => setShowReviewForm(true)}>Viết đánh giá</button>
      </div>
    </div>
  </>;


  const renderOverviewMobile = () => <>
    <div className="mobile-kicker">
      <div><span className={`sketch-chip ${selectedTour.is_premium ? 'sketch-chip-tertiary' : 'sketch-chip-secondary'}`}>{selectedTour.is_premium ? 'Premium' : 'Miễn phí'}</span></div>
      <button onClick={() => setShowChooser(true)}>Đổi hành trình</button>
    </div>
    <h1 className="mobile-title">{titleOf(selectedTour)}</h1>
    <p className="mobile-intro">{descriptionOf(selectedTour)}</p>
    <div className="mobile-metrics">
      <div><span>Chiều dài</span><strong>1.8 KM</strong></div>
      <div><span>Thời gian</span><strong>{selectedTour.estimated_duration_min || 45} PHÚT</strong></div>
      <div><span>Số trạm</span><strong>{String(orderedPOIs.length).padStart(2, '0')} TRẠM</strong></div>
    </div>
    <button className="sketch-btn sketch-btn-primary" style={{ width: '100%', marginTop: 14 }} onClick={primaryAction}>
      {selectedTour.is_premium && !selectedTour.is_unlocked ? 'Mở khóa' : tourStarted ? 'Kết thúc' : 'Bắt đầu hành trình'}
    </button>
    <div className="mobile-focus">
      {nextPOI ? (
        <>
          <span className="sketch-label">{tourStarted ? 'Đang đến gần' : 'Trạm hiện tại'}</span>
          <strong>{poiTitle(nextPOI)}</strong>
          <span>+{distanceToNext ?? '—'} M · AUDIO {estimateAudio(nextPOI.description)}</span>
        </>
      ) : <p className="mobile-intro">Đã hoàn tất hành trình.</p>}
    </div>
    <div className="mobile-next">
      {orderedPOIs.slice(currentPOIIndex + 1, currentPOIIndex + 3).map((item, offset) => (
        <div className="next-row" key={item.poi.id}>
          <span className="next-row-num">{String(currentPOIIndex + offset + 2).padStart(2, '0')}</span>
          <div>
            <strong>{poiTitle(item.poi)}</strong>
            <span>{item.poi.category} · {estimateAudio(item.poi.description)}</span>
          </div>
          <span className="next-row-end">{distanceToNext ? `+${distanceToNext} M` : 'UP'}</span>
        </div>
      ))}
    </div>
  </>;


  const renderRouteMobile = () => <>
    <div className="mobile-route-head">
      <h2>Lộ trình</h2>
      <p>{titleOf(selectedTour)}</p>
    </div>
    {orderedPOIs.map((item, index) => {
      const status = getPOIStatus(index, currentPOIIndex);
      const locked = Boolean(selectedTour.is_premium && !selectedTour.is_unlocked && index > 0);
      return (
        <div className={`ledger-row ${locked ? 'locked' : status}`} key={item.poi.id}>
          <span className="ledger-no">{String(index + 1).padStart(2, '0')}</span>
          <div className="ledger-copy">
            <strong>{poiTitle(item.poi)}</strong>
            <span>{item.poi.category}</span>
          </div>
          <div className="ledger-end">
            {locked ? <button className="sketch-btn sketch-btn-tertiary" onClick={() => setShowPremiumCheckout(true)}>Mở khóa</button>
              : status === 'current' ? <button className="sketch-btn sketch-btn-primary" onClick={() => startNarration(item.poi)}>Phát</button>
                : status === 'done' ? '✓' : `${index * 120 + 180} M`}
          </div>
        </div>
      );
    })}
  </>;


  const renderReviewsMobile = () => <>
    <div className="mobile-review-head">
      <h2>Đánh giá du khách</h2>
      <p>Tín hiệu chất lượng từ những người đã hoàn thành hành trình.</p>
    </div>
    <div className="rating-overview">
      <div className="rating-score">
        <strong>{stats.average.toFixed(1)}</strong>
        <span>NGOÀI {stats.total} ĐÁNH GIÁ</span>
      </div>
      <div className="rating-bars">
        {[5, 4, 3, 2, 1].map((star) => {
          const value = stats.total ? stats.distribution[star as 1 | 2 | 3 | 4 | 5] / stats.total * 100 : 0;
          return (
            <div className="rating-bar" key={star}>
              <span>{star}</span>
              <div className="rating-track"><i style={{ width: `${value}%` }} /></div>
              <span>{Math.round(value)}%</span>
            </div>
          );
        })}
      </div>
    </div>
    <div className="review-ledger">
      {reviews.length ? (
        reviews.map((review: TourReview) => (
          <article className="review-row" key={review.id}>
            <div className="review-row-head">
              <strong>{review.username}</strong>
              <time>{new Date(review.created_at).toLocaleDateString('vi-VN', { day: 'numeric', month: 'short', year: 'numeric' })}</time>
            </div>
            <div className="review-stars">{'★'.repeat(Math.max(1, Math.min(5, review.rating)))}</div>
            {review.comment && <p>{review.comment}</p>}
          </article>
        ))
      ) : (
        <p className="mobile-intro" style={{ marginTop: 15 }}>Chưa có đánh giá.</p>
      )}
    </div>
    <div className="review-cta" style={{ marginTop: 18 }}>
      <button className="sketch-btn sketch-btn-outline" style={{ width: '100%' }} onClick={() => setShowReviewForm(true)}>Viết đánh giá sau hành trình</button>
    </div>
  </>;


  return (
    <SketchFrame active="tours" className="tour-frame" searchPlaceholder="TÌM HÀNH TRÌNH HOẶC TRẠM..." searchValue={search} onSearchChange={setSearch} routeMark={String(currentPOIIndex + 1).padStart(2, '0')} routeTitle={titleOf(selectedTour)} routeMeta={tourMeta} routeProgress={progress} hideTopbar={true}>
      <div className="tour-page">
        <style>{`
          .desktop-view { height: 100%; display: block; min-height: 0; }
          .mobile-shell { display: none; height: 100%; min-height: 0; }
          @media (max-width: 767px) {
            .desktop-view { display: none !important; }
            .mobile-shell { display: grid !important; grid-template-rows: 56px minmax(0, 1fr) !important; }
          }
        `}</style>
        <div className="desktop-view">
          <section className={`tour-layout ${panelRetracted ? 'is-panel-retracted' : ''}`} id="tourLayout">
            <div className="tour-map-pane" id="mapPane">

              <div style={{ position: 'absolute', inset: 0 }}>
                <MapContainer preferCanvas={true} center={routePoints[0] || [10.7579, 106.7031]} zoom={15} zoomControl={false} style={{ height: '100%', width: '100%' }}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
                  <FitBounds points={routePoints} />
                  {tourStarted && <MapClickInterceptor onMapClick={setMockLocation} />}
                  <Polyline positions={routePoints} pathOptions={{ color: '#006D38', weight: 4, dashArray: '8 4' }} />
                  {orderedPOIs.map((item, index) => <Marker key={item.poi.id} position={[item.poi.latitude, item.poi.longitude]} icon={createMarkerIcon(index)} eventHandlers={{ click: () => startNarration(item.poi) }}><Popup>{poiTitle(item.poi)}</Popup></Marker>)}
                  {orderedPOIs.map((item) => <Circle key={`circle-${item.poi.id}`} center={[item.poi.latitude, item.poi.longitude]} radius={item.poi.geofence_radius} pathOptions={{ color: '#006D38', fillColor: '#006D38', fillOpacity: .06, weight: 1, dashArray: '4 4' }} />)}
                </MapContainer>
              </div>

              <div className="tour-map-summary" id="mapSummary">
                <div className="map-summary-top">
                  <span className="sketch-label">Lộ trình đang chọn</span>
                  <span className={`sketch-chip ${selectedTour.is_premium ? 'sketch-chip-tertiary' : 'sketch-chip-secondary'}`} id="mapBadge">{selectedTour.is_premium ? 'Premium' : 'Miễn phí'}</span>
                </div>
                <h2 id="mapTourTitle">{titleOf(selectedTour)}</h2>
                <p id="mapTourMeta">{tourMeta}</p>
              </div>
              {offRoute && (
                <div className="tour-offroute is-visible" id="offroute">
                  <div><strong>[CẢNH BÁO] Bạn đã lệch khỏi tuyến</strong><span>GPS vẫn hoạt động</span></div>
                </div>
              )}
              <div className="tour-map-controls">
                <button className="sketch-icon-button" aria-label="Phóng to">+</button>
                <button className="sketch-icon-button" aria-label="Thu nhỏ">−</button>
              </div>
              <div className="tour-map-footer">
                <div className="tour-distance"><span className="sketch-label">Còn lại</span><strong id="mapDistance">{distanceToNext ?? '—'} M</strong></div>
                <div className="tour-footer-copy"><span className="sketch-label" id="mapStepLabel">Trạm {String(Math.min(currentPOIIndex + 1, orderedPOIs.length)).padStart(2, '0')} / {String(orderedPOIs.length).padStart(2, '0')}</span><strong id="mapStopName">{nextPOI ? poiTitle(nextPOI) : 'Đã hoàn tất hành trình'}</strong></div>
                <div className="tour-footer-action"><button className="sketch-btn sketch-btn-outline" onClick={() => setShowMap(true)}>Xem các trạm</button></div>
              </div>
            </div>

            <aside className="plan-pane" id="planPane" aria-label="Chi tiết hành trình">
              <nav className="retractable-tabs" role="tablist" aria-label="Nội dung hành trình" aria-orientation="vertical" data-retractable-tabs="desktop">
                <button className="retractable-tab" id="desktopTabOverview" role="tab" aria-selected={activeTab === 'overview'} aria-controls="desktopPanelOverview" tabIndex={activeTab === 'overview' ? 0 : -1} data-tour-tab="overview" data-tab-scope="desktop" onClick={() => setActiveTab('overview')}>
                  <SketchIcon name="route" className="icon" /><span className="retractable-tab-label">Tổng quan</span><span className="retractable-tab-index">01</span>
                </button>
                <button className="retractable-tab" id="desktopTabRoute" role="tab" aria-selected={activeTab === 'route'} aria-controls="desktopPanelRoute" tabIndex={activeTab === 'route' ? 0 : -1} data-tour-tab="route" data-tab-scope="desktop" onClick={() => setActiveTab('route')}>
                  <SketchIcon name="playlist" className="icon" /><span className="retractable-tab-label">Lộ trình</span><span className="retractable-tab-index">02</span>
                </button>
                <button className="retractable-tab" id="desktopTabReviews" role="tab" aria-selected={activeTab === 'reviews'} aria-controls="desktopPanelReviews" tabIndex={activeTab === 'reviews' ? 0 : -1} data-tour-tab="reviews" data-tab-scope="desktop" onClick={() => setActiveTab('reviews')}>
                  <SketchIcon name="star" className="icon" /><span className="retractable-tab-label">Đánh giá</span><span className="retractable-tab-index">03</span>
                </button>
                <button className="panel-retract-toggle" id="desktopPanelToggle" aria-label="Thu gọn bảng chi tiết" aria-expanded={!panelRetracted} aria-controls="tourTabPanels" onClick={() => setPanelRetracted(!panelRetracted)}>
                  <SketchIcon name={panelRetracted ? 'chevron-right' : 'chevron-left'} className="icon" />
                </button>
              </nav>

              <div className="tour-tab-panels" id="tourTabPanels">
                <section className="tour-tab-panel" id="desktopPanelOverview" role="tabpanel" aria-labelledby="desktopTabOverview" data-tour-panel="overview" data-tab-scope="desktop" hidden={activeTab !== 'overview'}>
                  {renderOverview()}
                </section>
                <section className="tour-tab-panel route-tab-panel" id="desktopPanelRoute" role="tabpanel" aria-labelledby="desktopTabRoute" data-tour-panel="route" data-tab-scope="desktop" hidden={activeTab !== 'route'}>
                  {renderRoute()}
                </section>
                <section className="tour-tab-panel review-tab-panel" id="desktopPanelReviews" role="tabpanel" aria-labelledby="desktopTabReviews" data-tour-panel="reviews" data-tab-scope="desktop" hidden={activeTab !== 'reviews'}>
                  {renderReviews()}
                </section>
              </div>
            </aside>
          </section>
        </div>

        <div className={`mobile-shell ${mobilePanelRetracted ? 'is-panel-retracted' : ''}`} id="mobileShell">
          <header className="mobile-head">
            <div className="mobile-brand"><span className="brand-square" /><strong>NeonFoodmap</strong></div>
            <button onClick={() => { /* Settings handler */ }}><SketchIcon name="settings" /></button>
          </header>

          <main className="mobile-main">
            <section className="mobile-map">

              <div style={{ position: 'absolute', inset: 0 }}>
                <MapContainer preferCanvas={true} center={routePoints[0] || [10.7579, 106.7031]} zoom={15} zoomControl={false} style={{ height: '100%', width: '100%' }}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
                  <FitBounds points={routePoints} />
                  {tourStarted && <MapClickInterceptor onMapClick={setMockLocation} />}
                  <Polyline positions={routePoints} pathOptions={{ color: '#006D38', weight: 4, dashArray: '8 4' }} />
                  {orderedPOIs.map((item, index) => <Marker key={item.poi.id} position={[item.poi.latitude, item.poi.longitude]} icon={createMarkerIcon(index)} eventHandlers={{ click: () => startNarration(item.poi) }}><Popup>{poiTitle(item.poi)}</Popup></Marker>)}
                  {orderedPOIs.map((item) => <Circle key={`circle-${item.poi.id}`} center={[item.poi.latitude, item.poi.longitude]} radius={item.poi.geofence_radius} pathOptions={{ color: '#006D38', fillColor: '#006D38', fillOpacity: .06, weight: 1, dashArray: '4 4' }} />)}
                </MapContainer>
              </div>

              <div className="mobile-map-card">
                <strong>{titleOf(selectedTour)}</strong>
                <span className={`sketch-chip ${selectedTour.is_premium ? 'sketch-chip-tertiary' : 'sketch-chip-secondary'}`}>{selectedTour.is_premium ? 'Premium' : 'Miễn phí'}</span>
              </div>
              {offRoute && (
                <div className="offroute is-visible">
                  <div><strong>[CẢNH BÁO] Bạn đã lệch khỏi tuyến</strong><span>GPS vẫn hoạt động</span></div>
                </div>
              )}
              <div className="mobile-map-footer">
                <div><span className="sketch-label">Còn lại</span><strong>{distanceToNext ?? '—'} M</strong></div>
                <div><span className="sketch-label">Trạm {String(Math.min(currentPOIIndex + 1, orderedPOIs.length)).padStart(2, '0')} / {String(orderedPOIs.length).padStart(2, '0')}</span><strong>{nextPOI ? poiTitle(nextPOI) : 'Hoàn tất'}</strong></div>
              </div>
            </section>

            <div className="mobile-tab-shell">
              <nav className="mobile-tabs" role="tablist" aria-label="Nội dung hành trình" aria-orientation="horizontal" data-retractable-tabs="mobile">
                <button className="mobile-tab" id="mobileTabOverview" role="tab" aria-selected={activeTab === 'overview'} aria-controls="mobilePanelOverview" tabIndex={activeTab === 'overview' ? 0 : -1} data-tour-tab="overview" data-tab-scope="mobile" onClick={() => setActiveTab('overview')}>
                  <SketchIcon name="route" className="icon" /> Tổng quan
                </button>
                <button className="mobile-tab" id="mobileTabRoute" role="tab" aria-selected={activeTab === 'route'} aria-controls="mobilePanelRoute" tabIndex={activeTab === 'route' ? 0 : -1} data-tour-tab="route" data-tab-scope="mobile" onClick={() => setActiveTab('route')}>
                  <SketchIcon name="playlist" className="icon" /> Lộ trình
                </button>
                <button className="mobile-tab" id="mobileTabReviews" role="tab" aria-selected={activeTab === 'reviews'} aria-controls="mobilePanelReviews" tabIndex={activeTab === 'reviews' ? 0 : -1} data-tour-tab="reviews" data-tab-scope="mobile" onClick={() => setActiveTab('reviews')}>
                  <SketchIcon name="star" className="icon" /> Đánh giá
                </button>
                <button className="mobile-panel-toggle" id="mobilePanelToggle" aria-label="Thu gọn bảng chi tiết" aria-expanded={!mobilePanelRetracted} aria-controls="mobileTabPanels" onClick={() => setMobilePanelRetracted(!mobilePanelRetracted)}>
                  <SketchIcon name={mobilePanelRetracted ? 'chevron-up' : 'chevron-down'} className="icon" />
                </button>
              </nav>

              <div className="mobile-tab-panels" id="mobileTabPanels">
                <section className="mobile-plan mobile-tab-panel" id="mobilePanelOverview" role="tabpanel" aria-labelledby="mobileTabOverview" data-tour-panel="overview" data-tab-scope="mobile" hidden={activeTab !== 'overview'}>
                  {renderOverviewMobile()}
                </section>
                <section className="mobile-route-panel mobile-tab-panel" id="mobilePanelRoute" role="tabpanel" aria-labelledby="mobileTabRoute" data-tour-panel="route" data-tab-scope="mobile" hidden={activeTab !== 'route'}>
                  {renderRouteMobile()}
                </section>
                <section className="mobile-review-panel mobile-tab-panel" id="mobilePanelReviews" role="tabpanel" aria-labelledby="mobileTabReviews" data-tour-panel="reviews" data-tab-scope="mobile" hidden={activeTab !== 'reviews'}>
                  {renderReviewsMobile()}
                </section>
              </div>
            </div>
          </main>
        </div>
      </div>

      {showChooser && (
        <div className="scrim is-visible" role="dialog" aria-modal="true" style={{ zIndex: 9999 }}>
          <div className="modal">
            <div className="modal-head">
              <h2>Chọn hành trình</h2>
              <button className="sketch-icon-button" onClick={() => setShowChooser(false)} aria-label="Đóng">×</button>
            </div>
            <div className="tour-options">
              {filteredTours.map((tour) => (
                <button className="tour-option" key={tour.id} onClick={() => selectTour(tour)}>
                  <span className="tour-option-no">{String(tours.indexOf(tour) + 1).padStart(2, '0')}</span>
                  <span><strong>{titleOf(tour)}</strong><small>{tour.estimated_duration_min || 45} phút · {tour.pois.length} trạm</small></span>
                  <span className={`sketch-chip ${tour.is_premium ? 'sketch-chip-tertiary' : 'sketch-chip-secondary'}`}>{tour.is_premium ? 'Premium' : 'Free'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {showMap && (
        <div className="scrim is-visible" role="dialog" aria-modal="true" style={{ zIndex: 9999 }}>
          <div className="modal">
            <div className="modal-head">
              <h2>Bản đồ hành trình</h2>
              <button className="sketch-icon-button" onClick={() => setShowMap(false)} aria-label="Đóng">×</button>
            </div>
            <div style={{ height: '60vh', position: 'relative' }}>

              <div style={{ position: 'absolute', inset: 0 }}>
                <MapContainer preferCanvas={true} center={routePoints[0] || [10.7579, 106.7031]} zoom={15} zoomControl={false} style={{ height: '100%', width: '100%' }}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
                  <FitBounds points={routePoints} />
                  {tourStarted && <MapClickInterceptor onMapClick={setMockLocation} />}
                  <Polyline positions={routePoints} pathOptions={{ color: '#006D38', weight: 4, dashArray: '8 4' }} />
                  {orderedPOIs.map((item, index) => <Marker key={item.poi.id} position={[item.poi.latitude, item.poi.longitude]} icon={createMarkerIcon(index)} eventHandlers={{ click: () => startNarration(item.poi) }}><Popup>{poiTitle(item.poi)}</Popup></Marker>)}
                  {orderedPOIs.map((item) => <Circle key={`circle-${item.poi.id}`} center={[item.poi.latitude, item.poi.longitude]} radius={item.poi.geofence_radius} pathOptions={{ color: '#006D38', fillColor: '#006D38', fillOpacity: .06, weight: 1, dashArray: '4 4' }} />)}
                </MapContainer>
              </div>

            </div>
          </div>
        </div>
      )}
      {narrationData && (
        <div className="scrim is-visible" style={{ zIndex: 9999 }}>
          <NarrationBottomSheet key={narrationData.poi.id} poi={narrationData.poi} media={narrationData.media} onClose={closeNarrationSheet} />
        </div>
      )}
      {showPremiumCheckout && selectedTour.is_premium && (
        <PremiumTourCheckout tour={selectedTour} onClose={() => setShowPremiumCheckout(false)} onSuccess={() => { getTours().then((data) => { setTours(data); setSelectedTour(data.find((tour) => tour.id === selectedTour.id) || selectedTour); }).catch(() => undefined); }} />
      )}
      {showReviewForm && (
        <ReviewForm onClose={() => setShowReviewForm(false)} onSubmit={async (rating, comment) => { await addReview({ tour: Number(selectedTour.id), rating, comment }); setShowReviewForm(false); }} />
      )}
    </SketchFrame>
  );

}
