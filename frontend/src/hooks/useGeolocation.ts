import { useState, useEffect, useRef, useCallback } from 'react';
import type { BreadcrumbPoint } from '../types';
import { postBreadcrumbs } from '../services/api';

const BATCH_SIZE = 10;
const INTERVAL_MS = 20000; // 20 giây
const MIN_MOVEMENT_METERS = 5;

function calcDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface GeoPosition {
    lat: number;
    lng: number;
}

export function useGeolocation() {
    const [position, setPosition] = useState<GeoPosition | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [permissionStatus, setPermissionStatus] = useState<'pending' | 'granted' | 'denied'>('pending');
    const [isMocking, setIsMocking] = useState(false);
    const breadcrumbBuffer = useRef<BreadcrumbPoint[]>([]);
    const lastPositionRef = useRef<GeoPosition | null>(null);
    const watchIdRef = useRef<number | null>(null);

    const flushBreadcrumbs = useCallback(async () => {
        if (breadcrumbBuffer.current.length === 0) return;
        const points = [...breadcrumbBuffer.current];
        breadcrumbBuffer.current = [];
        try {
            await postBreadcrumbs(points);
        } catch {
            // Re-add to buffer nếu offline (sẽ được sync sau)
            breadcrumbBuffer.current = [...points, ...breadcrumbBuffer.current];
        }
    }, []);

    const setMockLocation = useCallback((lat: number, lng: number) => {
        setIsMocking(true);
        const newPos = { lat, lng };
        setPosition(newPos);
        setPermissionStatus('granted');
        
        const point: BreadcrumbPoint = {
            lat: newPos.lat,
            long: newPos.lng,
            timestamp: new Date().toISOString(),
        };
        breadcrumbBuffer.current.push(point);
        if (breadcrumbBuffer.current.length >= BATCH_SIZE) {
            flushBreadcrumbs();
        }
    }, [flushBreadcrumbs]);

    useEffect(() => {
        if (!navigator.geolocation) {
            setError('Thiết bị không hỗ trợ GPS');
            setPermissionStatus('denied');
            return;
        }

        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                if (isMocking) return; // Bỏ qua GPS thật nếu đang mock (click map)
                
                const newPos: GeoPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setPermissionStatus('granted');
                const last = lastPositionRef.current;

                // Rule: chỉ lưu nếu di chuyển đủ xa (tiết kiệm pin)
                if (last && calcDistance(last.lat, last.lng, newPos.lat, newPos.lng) < MIN_MOVEMENT_METERS) return;

                setPosition(newPos);
                lastPositionRef.current = newPos;

                const point: BreadcrumbPoint = {
                    lat: newPos.lat,
                    long: newPos.lng,
                    timestamp: new Date().toISOString(),
                };
                breadcrumbBuffer.current.push(point);

                // Gom đủ BATCH_SIZE thì flush
                if (breadcrumbBuffer.current.length >= BATCH_SIZE) {
                    flushBreadcrumbs();
                }
            },
            (err) => {
                if (isMocking) return;
                setPermissionStatus('denied');
                setError(err.message);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: INTERVAL_MS,
            }
        );

        // Periodic flush mỗi 2 phút để không để quá lâu
        const flushTimer = setInterval(flushBreadcrumbs, 120000);

        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
            clearInterval(flushTimer);
            // Flush lần cuối khi component unmount
            flushBreadcrumbs();
        };
    }, [flushBreadcrumbs, isMocking]);

    const requestPermission = useCallback(() => {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                if (isMocking) return;
                setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setPermissionStatus('granted');
            },
            () => {
                if (isMocking) return;
                setPermissionStatus('denied');
            }
        );
    }, [isMocking]);

    return { position, error, permissionStatus, requestPermission, setMockLocation, isMocking };
}
