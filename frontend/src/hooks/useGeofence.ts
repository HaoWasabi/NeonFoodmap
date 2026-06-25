import { useEffect, useRef, useCallback } from 'react';
import type { POI } from '../types';
import type { GeoPosition } from './useGeolocation';

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface UseGeofenceOptions {
    pois: POI[];
    position: GeoPosition | null;
    onEnter: (poi: POI) => void;
    onExit?: (poi: POI) => void;
}

export function useGeofence({ pois, position, onEnter, onExit }: UseGeofenceOptions) {
    // Track trạng thái "đang ở trong" của từng POI
    const insideSetRef = useRef<Set<string>>(new Set());
    const onEnterRef = useRef(onEnter);
    const onExitRef = useRef(onExit);

    // Luôn cập nhật callback ref để không bị stale closure
    useEffect(() => { onEnterRef.current = onEnter; }, [onEnter]);
    useEffect(() => { onExitRef.current = onExit; }, [onExit]);

    useEffect(() => {
        if (!position || pois.length === 0) return;

        pois.forEach((poi) => {
            const dist = haversineDistance(position.lat, position.lng, poi.latitude, poi.longitude);
            const isCurrentlyInside = dist <= poi.geofence_radius;
            const wasPreviouslyInside = insideSetRef.current.has(poi.id);

            if (isCurrentlyInside && !wasPreviouslyInside) {
                // ENTER event
                insideSetRef.current.add(poi.id);
                onEnterRef.current(poi);
            } else if (!isCurrentlyInside && wasPreviouslyInside) {
                // EXIT event
                insideSetRef.current.delete(poi.id);
                onExitRef.current?.(poi);
            }
        });
    }, [position, pois]);

    // Utility để tính khoảng cách từ current position tới 1 POI cụ thể
    const getDistanceTo = useCallback((poi: POI): number => {
        if (!position) return Infinity;
        return haversineDistance(position.lat, position.lng, poi.latitude, poi.longitude);
    }, [position]);

    return { getDistanceTo };
}
