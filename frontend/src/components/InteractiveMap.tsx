import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import maplibregl, { type Map as MapLibreMap, type Marker as MapLibreMarker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTranslation } from 'react-i18next';
import type { POI } from '../types';

interface InteractiveMapProps {
    pois: POI[];
    position: { lat: number; lng: number } | null;
    isMocking?: boolean;
    permissionStatus?: 'pending' | 'granted' | 'denied';
    isRecenterRequested?: boolean;
    onOpenPoi: (poi: POI) => void;
    onMapClick: (lat: number, lng: number) => void;
    onLocate: () => void;
}

type MapMode = 'flat' | 'tilt';

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/bright';
const OPENFREEMAP_TILES = 'https://tiles.openfreemap.org/planet';
const DEFAULT_CENTER: [number, number] = [106.6978, 10.7624];
const DEFAULT_ZOOM = 15.25;

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    })[character] || character);
}

function createCircle(center: [number, number], radiusMeters: number): GeoJSON.Feature<GeoJSON.Polygon> {
    const [lng, lat] = center;
    const latitudeScale = 111_320;
    const longitudeScale = Math.max(1, Math.cos((lat * Math.PI) / 180) * latitudeScale);
    const coordinates = Array.from({ length: 65 }, (_, index) => {
        const angle = (index === 64 ? 0 : (index / 64) * Math.PI * 2);
        return [
            lng + (Math.cos(angle) * radiusMeters) / longitudeScale,
            lat + (Math.sin(angle) * radiusMeters) / latitudeScale,
        ];
    });
    return {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [coordinates] },
    };
}

function getPoiCoordinates(poi: POI): [number, number] | null {
    const latitude = Number(poi.latitude);
    const longitude = Number(poi.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude)
        ? [longitude, latitude]
        : null;
}

function getGeofenceRadius(poi: POI): number {
    const radius = Number(poi.geofence_radius);
    return Number.isFinite(radius) && radius > 0 ? radius : 105;
}

function iconPath(name: 'plus' | 'minus' | 'locate' | '3d') {
    if (name === 'plus') return <path d="M12 5v14M5 12h14" />;
    if (name === 'minus') return <path d="M5 12h14" />;
    if (name === '3d') return <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>;
    return <><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></>;
}

function SketchIcon({ name }: { name: 'plus' | 'minus' | 'locate' | '3d' }) {
    return <svg className="fmap002-icon" viewBox="0 0 24 24" aria-hidden="true">{iconPath(name)}</svg>;
}

function createPoiMarker(poi: POI, isFeatured: boolean, onOpenPoi: (poi: POI) => void, t: (key: string) => string): HTMLElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = `fmap002-map-marker${isFeatured ? ' is-featured' : ''}`;
    element.setAttribute('aria-label', `${t('interactiveMap.openLocation')} ${poi.translated_name || poi.name}`);
    element.innerHTML = `<span class="fmap002-map-marker__core"></span><span class="fmap002-map-marker__label">${escapeHtml((poi.translated_name || poi.name).toLocaleUpperCase('vi').slice(0, 22))}</span>`;
    element.addEventListener('click', (event) => {
        event.stopPropagation();
        onOpenPoi(poi);
    });
    return element;
}

function createUserMarker(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'fmap002-map-user-marker';
    element.setAttribute('aria-hidden', 'true');
    element.innerHTML = '<span class="fmap002-map-user-marker__pulse"></span><span class="fmap002-map-user-marker__core"></span><span class="fmap002-map-user-marker__cross"></span>';
    return element;
}

function findLabelLayer(map: MapLibreMap): string | undefined {
    return map.getStyle().layers?.find((layer) => layer.type === 'symbol' && Boolean(layer.layout?.['text-field']))?.id;
}

function addExtrudedBuildings(map: MapLibreMap): void {
    if (map.getLayer('fmap002-3d-buildings')) return;

    const sourceId = map.getSource('openmaptiles') ? 'openmaptiles' : 'fmap002-openfreemap';
    if (!map.getSource(sourceId)) {
        map.addSource(sourceId, { type: 'vector', url: OPENFREEMAP_TILES });
    }

    map.addLayer({
        id: 'fmap002-3d-buildings',
        source: sourceId,
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 14,
        filter: ['!=', ['get', 'hide_3d'], true],
        paint: {
            'fill-extrusion-color': [
                'interpolate', ['linear'], ['get', 'render_height'],
                0, '#f8f8f3', 8, '#e6e7de', 22, '#c8cec3', 60, '#aeb8aa',
            ],
            'fill-extrusion-height': [
                'interpolate', ['linear'], ['zoom'], 14, 0, 15.25,
                ['coalesce', ['get', 'render_height'], ['get', 'height'], 8],
            ],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
            'fill-extrusion-opacity': 0.88,
        },
    } as never, findLabelLayer(map));
}

export default function InteractiveMap({
    pois,
    position,
    isRecenterRequested,
    onOpenPoi,
    onMapClick,
    onLocate,
}: InteractiveMapProps) {
    const { t } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const poiMarkersRef = useRef<MapLibreMarker[]>([]);
    const userMarkerRef = useRef<MapLibreMarker | null>(null);
    const callbacksRef = useRef({ onOpenPoi, onMapClick });
    const [mode, setMode] = useState<MapMode>('flat');
    const [mapReady, setMapReady] = useState(false);
    const [mapError, setMapError] = useState(false);
    const [show3dEntity, setShow3dEntity] = useState(true);

    callbacksRef.current = { onOpenPoi, onMapClick };
    const mapPois = pois;
    const mappablePois = useMemo(() => mapPois.filter((poi) => getPoiCoordinates(poi)), [mapPois]);
    const featuredPoi = useMemo(() => mappablePois.find((poi) => poi.category === 'food') || mappablePois[0], [mappablePois]);
    const featuredCenter = useMemo<[number, number]>(() => featuredPoi
        ? getPoiCoordinates(featuredPoi) || DEFAULT_CENTER
        : DEFAULT_CENTER, [featuredPoi]);
    const featuredDistance = Math.round(featuredPoi?.distance ?? 45);


    useEffect(() => {
        if (!containerRef.current || mapRef.current) return undefined;

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: OPENFREEMAP_STYLE,
            center: position ? [position.lng, position.lat] : featuredCenter,
            zoom: DEFAULT_ZOOM,
            pitch: 0,
            bearing: -2,
            attributionControl: { compact: true },
        });
        mapRef.current = map;

        let loaded = false;
        const failSafe = window.setTimeout(() => {
            if (!loaded) setMapError(true);
        }, 9_000);

        const handleLoad = () => {
            try {
                addExtrudedBuildings(map);
                map.addSource('fmap002-geofence', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] },
                });
                map.addLayer({
                    id: 'fmap002-geofence-fill',
                    type: 'fill',
                    source: 'fmap002-geofence',
                    paint: { 'fill-color': '#006d38', 'fill-opacity': 0.14 },
                });
                map.addLayer({
                    id: 'fmap002-geofence-line',
                    type: 'line',
                    source: 'fmap002-geofence',
                    paint: { 'line-color': '#006d38', 'line-width': 2, 'line-dasharray': [2, 2] },
                });
                loaded = true;
                setMapReady(true);
                setMapError(false);
            } catch (error) {
                console.error('[Map] OpenFreeMap 2.5D layer failed', error);
                setMapError(true);
            }
        };
        const handleMapClick = (event: maplibregl.MapMouseEvent) => {
            callbacksRef.current.onMapClick(event.lngLat.lat, event.lngLat.lng);
        };
        const handleMapError = () => {
            if (!mapReady) setMapError(true);
        };
        map.on('load', handleLoad);
        map.on('click', handleMapClick);
        map.on('error', handleMapError);

        return () => {
            window.clearTimeout(failSafe);
            poiMarkersRef.current.forEach((marker) => marker.remove());
            userMarkerRef.current?.remove();
            map.remove();
            mapRef.current = null;
        };
        // Map initialization intentionally runs once; props are synchronized by the effects below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        const container = containerRef.current;
        if (!map || !container || !mapReady) return undefined;

        let frame = 0;
        const resizeMap = () => {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(() => map.resize());
        };
        const observer = new ResizeObserver(resizeMap);
        observer.observe(container);
        resizeMap();

        return () => {
            window.cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [mapReady]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;
        map.easeTo({ pitch: mode === 'tilt' ? 48 : 0, bearing: mode === 'tilt' ? -12 : 0, duration: 760 });
    }, [mapReady, mode]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;
        if (map.getLayer('fmap002-3d-buildings')) {
            map.setLayoutProperty('fmap002-3d-buildings', 'visibility', show3dEntity ? 'visible' : 'none');
        }
    }, [mapReady, show3dEntity]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady || position || !featuredPoi) return;
        map.easeTo({ center: featuredCenter, duration: 720 });
    }, [featuredCenter, featuredPoi, mapReady, position]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;

        poiMarkersRef.current.forEach((marker) => marker.remove());
        poiMarkersRef.current = mappablePois.map((poi) => {
            const coordinates = getPoiCoordinates(poi);
            return new maplibregl.Marker({
                element: createPoiMarker(poi, poi.id === featuredPoi?.id, callbacksRef.current.onOpenPoi, t),
                anchor: 'center',
            }).setLngLat(coordinates || DEFAULT_CENTER).addTo(map);
        });

        const geofenceSource = map.getSource('fmap002-geofence') as maplibregl.GeoJSONSource | undefined;
        geofenceSource?.setData({
            type: 'FeatureCollection',
            features: mappablePois
                .map((poi) => {
                    const coordinates = getPoiCoordinates(poi);
                    return coordinates ? createCircle(coordinates, getGeofenceRadius(poi)) : null;
                })
                .filter((feature): feature is GeoJSON.Feature<GeoJSON.Polygon> => feature !== null),
        });

        if (mappablePois.length > 0) {
            const bounds = new maplibregl.LngLatBounds();
            mappablePois.forEach((poi) => {
                const coordinates = getPoiCoordinates(poi);
                if (coordinates) bounds.extend(coordinates);
            });
            if (!bounds.isEmpty()) {
                map.fitBounds(bounds, {
                    padding: { top: 72, right: 72, bottom: 128, left: 72 },
                    maxZoom: DEFAULT_ZOOM,
                    duration: 0,
                });
            }
        }
    }, [featuredPoi, mapReady, mappablePois]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;
        const markerElement = userMarkerRef.current?.getElement() || createUserMarker();
        markerElement.classList.toggle('is-live', Boolean(position));
        markerElement.classList.toggle('is-locating', isRecenterRequested);
        if (!userMarkerRef.current) userMarkerRef.current = new maplibregl.Marker({ element: markerElement, anchor: 'center' });
        userMarkerRef.current.setLngLat(position ? [position.lng, position.lat] : DEFAULT_CENTER).addTo(map);
    }, [isRecenterRequested, mapReady, position]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !isRecenterRequested) return;
        map.flyTo({ center: position ? [position.lng, position.lat] : DEFAULT_CENTER, zoom: Math.max(map.getZoom(), DEFAULT_ZOOM), duration: 900 });
    }, [isRecenterRequested, position]);

    const stopOverlayEvent = (event: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>) => {
        event.stopPropagation();
    };

    return (
        <div className={`fmap002-map${mode === 'tilt' ? ' is-tilt' : ''}`}>
            <div aria-label={t('interactiveMap.mapViewport')} className="fmap002-map-viewport" ref={containerRef} />
            <div className="fmap002-map-vignette" aria-hidden="true" />
            {mapError && (
                <div className="fmap002-map-error" role="status">
                    <strong>REAL MAP OFFLINE</strong>
                    <span>{t('interactiveMap.mapOfflineError')}</span>
                </div>
            )}

            <div aria-label={t('interactiveMap.viewMode')} className="fmap002-map-mode-toggle">
                <button className={`fmap002-map-mode-button${mode === 'flat' ? ' is-active' : ''}`} type="button" onClick={(event) => { stopOverlayEvent(event); setMode('flat'); }}>2D FLAT</button>
                <button className={`fmap002-map-mode-button${mode === 'tilt' ? ' is-active' : ''}`} type="button" onClick={(event) => { stopOverlayEvent(event); setMode('tilt'); }}>2.5D TILT</button>
            </div>
            <div aria-label={t('interactiveMap.entity3D')} className="fmap002-map-entity-toggle">
                <button aria-label={t('interactiveMap.toggle3D')} className={`fmap002-icon-button${show3dEntity ? ' is-active' : ''}`} type="button" onClick={(event) => { stopOverlayEvent(event); setShow3dEntity(!show3dEntity); }}><SketchIcon name="3d" /></button>
            </div>
            <div aria-label={t('interactiveMap.mapControls')} className="fmap002-map-toolbar">
                <button aria-label={t('interactiveMap.zoomIn')} className="fmap002-icon-button" type="button" onClick={(event) => { stopOverlayEvent(event); mapRef.current?.zoomIn({ duration: 260 }); }}><SketchIcon name="plus" /></button>
                <button aria-label={t('interactiveMap.zoomOut')} className="fmap002-icon-button" type="button" onClick={(event) => { stopOverlayEvent(event); mapRef.current?.zoomOut({ duration: 260 }); }}><SketchIcon name="minus" /></button>
                <button aria-label={t('interactiveMap.myLocation')} className="fmap002-icon-button" type="button" onClick={(event) => { stopOverlayEvent(event); onLocate(); }}><SketchIcon name="locate" /></button>
            </div>
            <div className="fmap002-map-legend">
                <span className="fmap002-legend-code">POI {String(featuredPoi ? Math.max(1, mapPois.indexOf(featuredPoi) + 1) : 2).padStart(2, '0')}</span>
                <span className="fmap002-legend-copy"><span>GEOFENCE ACTIVE</span><strong>{t('interactiveMap.tapMarkerInstruction')}</strong></span>
                <span className="fmap002-legend-distance">{featuredDistance} M</span>
            </div>
        </div>
    );
}
