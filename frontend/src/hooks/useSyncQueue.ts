import { useCallback, useEffect, useRef } from 'react';
import { postBreadcrumbs, startNarration, endNarration } from '../services/api';

const SYNC_QUEUE_KEY = 'bcsd_sync_queue';
const SYNC_INTERVAL_MS = 30000; // 30 giây

export interface SyncQueueItem {
    type: 'breadcrumb' | 'narration_start' | 'narration_end';
    payload: Record<string, unknown>;
    created_at: string;
}

function getQueue(): SyncQueueItem[] {
    try {
        return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');
    } catch {
        return [];
    }
}

function setQueue(queue: SyncQueueItem[]) {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Hook quản lý Sync Queue:
 * - Khi offline: gom tất cả request ghi log vào queue trong localStorage
 * - Khi online: flush hàng loạt lên server
 */
export function useSyncQueue() {
    const flushingRef = useRef(false);

    // Thêm item vào queue
    const enqueue = useCallback((item: Omit<SyncQueueItem, 'created_at'>) => {
        const queue = getQueue();
        queue.push({ ...item, created_at: new Date().toISOString() });
        // Giới hạn 500 items
        setQueue(queue.slice(-500));
    }, []);

    // Flush queue lên server
    const flush = useCallback(async () => {
        if (flushingRef.current || !navigator.onLine) return;
        flushingRef.current = true;

        const queue = getQueue();
        if (queue.length === 0) {
            flushingRef.current = false;
            return;
        }

        const remaining: SyncQueueItem[] = [];

        for (const item of queue) {
            try {
                switch (item.type) {
                    case 'breadcrumb':
                        await postBreadcrumbs(
                            item.payload.points as { lat: number; long: number; timestamp: string }[]
                        );
                        break;
                    case 'narration_start':
                        await startNarration({
                            poi: item.payload.poi_id as string,
                            start_time: item.payload.start_time as string,
                            trigger_type: item.payload.trigger_type as 'AUTO' | 'QR',
                        });
                        break;
                    case 'narration_end':
                        await endNarration(
                            item.payload.log_id as string,
                            item.payload.duration as number
                        );
                        break;
                }
            } catch {
                // Nếu vẫn fail, giữ item trong queue
                remaining.push(item);
            }
        }

        setQueue(remaining);
        flushingRef.current = false;
    }, []);

    // Số lượng items đang chờ
    const getPendingCount = useCallback(() => getQueue().length, []);

    // Tự động flush khi có mạng
    useEffect(() => {
        const handleOnline = () => flush();
        window.addEventListener('online', handleOnline);

        // Periodic flush
        const timer = setInterval(() => {
            if (navigator.onLine) flush();
        }, SYNC_INTERVAL_MS);

        // Flush ngay khi mount nếu online
        if (navigator.onLine) flush();

        return () => {
            window.removeEventListener('online', handleOnline);
            clearInterval(timer);
        };
    }, [flush]);

    return { enqueue, flush, getPendingCount };
}
