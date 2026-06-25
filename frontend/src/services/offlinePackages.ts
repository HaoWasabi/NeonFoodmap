import type { Tour, TourPOIGroup } from '../types';
import { getTourById, getTourPOIGroups, getTours } from './api';

export interface OfflinePackageData {
    id: string;
    name: string;
    description: string;
    translated_name?: Record<string, string>;
    translated_description?: Record<string, string>;
    poi_count: number;
    size_mb: number;
    source: 'api' | 'mock';
    source_detail: 'tour-pois' | 'tours-fallback' | 'mock';
    related_pois: Array<{
        id: string;
        name: string;
        sequence_order: number;
    }>;
    is_premium?: boolean;
    premium_price?: number;
    is_unlocked?: boolean;
}

export class OfflineDataSourceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OfflineDataSourceError';
    }
}

const createApiOfflineBlob = async (tourId: string): Promise<Blob> => {
    let tour: Tour | null = null;
    try {
        tour = await getTourById(tourId);
    } catch {
        const tours = await getTours();
        tour = tours.find((item) => String(item.id) === String(tourId)) ?? null;
    }

    if (!tour) {
        throw new Error('Không tìm thấy tour để tạo gói offline.');
    }

    let groups: TourPOIGroup[] = [];
    try {
        groups = await getTourPOIGroups([tourId]);
    } catch {
        groups = [];
    }

    const group = groups[0] ?? null;
    const tourPois = group
        ? group.items.map((item) => ({
            sequence_order: item.sequence_order,
            poi: item.poi,
        }))
        : (tour.pois || []).map((item) => ({
            sequence_order: item.sequence_order,
            poi: item.poi,
        }));

    const pois = tourPois.map((item) => item.poi);

    // Extract all media URLs for this tour
    const mediaUrls = new Set<string>();
    if (tour.cover_image_url) mediaUrls.add(tour.cover_image_url);
    pois.forEach(poi => {
        if (poi.image_url) mediaUrls.add(poi.image_url);
        
        // Thêm tất cả tệp âm thanh/TTS đa ngôn ngữ
        if (Array.isArray(poi.media)) {
            poi.media.forEach(m => {
                if (m.file_url) mediaUrls.add(m.file_url);
            });
        }
    });

    const payload = {
        package_type: 'tour_offline_package',
        source: 'api',
        tour_id: tourId,
        generated_at: new Date().toISOString(),
        tour,
        tour_pois_group: group,
        tour_pois: tourPois,
        pois,
        media_urls: Array.from(mediaUrls),
    };

    return new Blob([JSON.stringify(payload)], { type: 'application/json' });
};

export const downloadTourOfflinePackage = createApiOfflineBlob;

const bytesToMb = (bytes: number): number => {
    const mb = bytes / (1024 * 1024);
    return Math.max(0.01, Number(mb.toFixed(2)));
};

const groupByTourId = (groups: TourPOIGroup[]): Map<string, TourPOIGroup> => {
    const map = new Map<string, TourPOIGroup>();
    groups.forEach((group) => {
        map.set(String(group.tour_id), group);
    });
    return map;
};

const mapToursToPackages = (tours: Tour[], groups: TourPOIGroup[]): OfflinePackageData[] => {
    const groupMap = groupByTourId(groups);

    return tours.map((tour) => {
        const group = groupMap.get(String(tour.id));
        const poiCount = group?.items?.length ?? tour.pois?.length ?? 0;
        const payloadBytes =
            group?.payload_bytes ??
            (group ? new TextEncoder().encode(JSON.stringify(group)).length : 0);
        const relatedPois = group
            ? group.items.map((item) => ({
                id: String(item.poi.id),
                name: item.poi.name,
                sequence_order: item.sequence_order,
            }))
            : (tour.pois || []).map((item) => ({
                id: String(item.poi.id),
                name: item.poi.name,
                sequence_order: item.sequence_order,
            }));

        return {
            id: String(tour.id),
            name: tour.name,
            description: tour.description || 'Gói dữ liệu offline cho tour này',
            translated_name: tour.translated_name,
            translated_description: tour.translated_description,
            poi_count: poiCount,
            size_mb: bytesToMb(payloadBytes),
            source: 'api' as const,
            source_detail: group ? 'tour-pois' : 'tours-fallback',
            related_pois: relatedPois,
            is_premium: tour.is_premium,
            premium_price: tour.premium_price,
            is_unlocked: tour.is_unlocked,
        };
    });
};

export const downloadMediaWithProgress = async (
    urls: string[],
    onProgress: (progress: number, currentUrl: string) => void
): Promise<void> => {
    let completed = 0;
    const total = urls.length;
    if (total === 0) return;

    // Concurrency control: max 3 at a time
    const CONCURRENCY = 3;
    const queue = [...urls];
    
    const worker = async () => {
        while (queue.length > 0) {
            const url = queue.shift();
            if (!url) break;
            
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Fetch failed for ${url}`);
                const blob = await response.blob();
                
                // Import saveMediaBlob dynamically to avoid circular dependency if any
                const { saveMediaBlob } = await import('./offlineStorage');
                await saveMediaBlob(url, blob);
            } catch (error) {
                console.error(`Failed to download media: ${url}`, error);
            } finally {
                completed++;
                onProgress((completed / total) * 100, url);
            }
        }
    };

    const workers = Array(Math.min(CONCURRENCY, total)).fill(null).map(() => worker());
    await Promise.all(workers);
};

export const getAvailableOfflinePackages = async (): Promise<OfflinePackageData[]> => {
    try {
        const tours = await getTours();
        if (tours.length === 0) {
            return [];
        }

        const tourIds = tours.map((tour) => String(tour.id));
        const groups = await getTourPOIGroups(tourIds);
        const packages = mapToursToPackages(tours, groups);

        return packages;
    } catch {
        throw new OfflineDataSourceError('Không thể tải dữ liệu từ API. Vui lòng kiểm tra backend.');
    }
};
