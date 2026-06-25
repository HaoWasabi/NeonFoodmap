import { useState, useEffect } from 'react';
import { getMediaBlob } from '../services/offlineStorage';

/**
 * Hook to retrieve a local blob URL for a given media URL if it exists in the offline cache.
 * Falls back to the original URL if not found or if an error occurs.
 */
export function useOfflineMedia(url?: string) {
    const [localUrl, setLocalUrl] = useState<string | undefined>(url);
    const [isOffline, setIsOffline] = useState(false);

    useEffect(() => {
        if (!url) {
            setLocalUrl(undefined);
            return;
        }

        let isMounted = true;
        let blobUrl: string | null = null;

        const loadOfflineMedia = async () => {
            try {
                const blob = await getMediaBlob(url);
                if (blob && isMounted) {
                    blobUrl = URL.createObjectURL(blob);
                    setLocalUrl(blobUrl);
                    setIsOffline(true);
                } else if (isMounted) {
                    setLocalUrl(url);
                    setIsOffline(false);
                }
            } catch (error) {
                console.error('Error loading offline media:', error);
                if (isMounted) {
                    setLocalUrl(url);
                    setIsOffline(false);
                }
            }
        };

        loadOfflineMedia();

        return () => {
            isMounted = false;
            if (blobUrl) {
                URL.revokeObjectURL(blobUrl);
            }
        };
    }, [url]);

    return { localUrl, isOffline };
}
