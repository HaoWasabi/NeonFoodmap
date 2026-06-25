import { useCallback, useRef } from 'react';
import type { POI, Media, Partner, Language, VoiceRegion } from '../types';
import { startNarration, endNarration, getPOIMedia, getPOIPartners, selectBestMedia } from '../services/api';

const ANTI_SPAM_MINUTES = 2; // Giảm xuống 2 phút để user dễ test và phù hợp thực tế quay lại địa điểm
const LOG_PREFIX = '[NarrationEngine]';
const LOG_KEY = 'bcsd_narration_logs';

interface NarrationLogLocal {
    poi_id: string;
    start_time: number; // timestamp ms
    trigger_type: 'AUTO' | 'QR';
    log_id?: string | number;
}

function getLocalLogs(): NarrationLogLocal[] {
    try {
        return JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveLocalLog(log: NarrationLogLocal) {
    const logs = getLocalLogs();
    logs.push(log);
    // Giữ tối đa 200 records trong localStorage
    const trimmed = logs.slice(-200);
    localStorage.setItem(LOG_KEY, JSON.stringify(trimmed));
}

interface UseNarrationEngineOptions {
    language: Language;
    voiceRegion: VoiceRegion;
    onNarrationReady: (poi: POI, media: Media | null, partners: Partner[]) => void;
    onNarrationConflict: (newPoi: POI) => void;
}


export function useNarrationEngine({
    language,
    voiceRegion,
    onNarrationReady,
    onNarrationConflict,
}: UseNarrationEngineOptions) {
    const isPlayingRef = useRef(false);
    const currentLogIdRef = useRef<string | null>(null);
    const currentPoiRef = useRef<POI | null>(null);



    /**
     * Kích hoạt thuyết minh (tự động hoặc quét QR)
     */
    const triggerNarration = useCallback(
        async (poi: POI, triggerType: 'AUTO' | 'QR' = 'AUTO') => {
            // 1. Kiểm tra conflict (đang phát POI khác)
            if (isPlayingRef.current && currentPoiRef.current?.id !== poi.id) {
                console.log(LOG_PREFIX, 'Conflict detected for:', poi.name);
                onNarrationConflict(poi);
                return;
            }

            // 2. Kiểm tra Anti-Spam cho trigger AUTO
            if (triggerType === 'AUTO') {
                const lastHeard = localStorage.getItem(`bcsd_last_heard_${poi.id}`);
                if (lastHeard) {
                    const diff = Date.now() - parseInt(lastHeard, 10);
                    if (diff < ANTI_SPAM_MINUTES * 60 * 1000) {
                        console.warn(LOG_PREFIX, 'Skip auto narration (Anti-spam) for:', poi.name, 
                            'Remaining:', Math.ceil((ANTI_SPAM_MINUTES * 60 * 1000 - diff) / 1000), 's');
                        return;
                    }
                }
            }

            console.log(LOG_PREFIX, 'Triggering narration for:', poi.name, 'Type:', triggerType);

            // 3. Mark as playing
            isPlayingRef.current = true;
            currentPoiRef.current = poi;

            // Log start to Backend
            const logEntry: NarrationLogLocal = {
                poi_id: poi.id,
                start_time: Date.now(),
                trigger_type: triggerType,
            };

            try {
                const response = await startNarration({
                    poi: Number(poi.id),
                    start_time: new Date().toISOString(),
                    trigger_type: triggerType,
                });
                const logId = response.log?.id;
                logEntry.log_id = logId;
                currentLogIdRef.current = logId ?? null;
            } catch (err) {
                console.warn(LOG_PREFIX, 'Backend log failed (offline?)', err);
                currentLogIdRef.current = null;
            }
            saveLocalLog(logEntry);

            // 4. Record timestamp for anti-spam (LOCAL ONLY)
            localStorage.setItem(`bcsd_last_heard_${poi.id}`, Date.now().toString());

            // 5. Fetch Media & Partners
            let [media, partners] = await Promise.all([
                getPOIMedia(poi.id, language, voiceRegion),
                getPOIPartners(poi.id).catch(() => [] as Partner[]),
            ]);

            // Offline handle: Nếu không fetch được media từ API nhưng trong POI object đã có sẵn media array (từ offline package)
            if (!media && Array.isArray(poi.media)) {
                console.log(LOG_PREFIX, 'API media missing, selecting from local poi.media (offline mode)');
                media = selectBestMedia(poi.media, language, voiceRegion);
            }

            // 6. Notify UI
            console.log(LOG_PREFIX, 'Narration ready for:', poi.name, 'Media:', media ? `${media.language} (${media.media_type})` : 'TTS Fallback');
            onNarrationReady(poi, media, partners);
        },
        [language, voiceRegion, onNarrationReady, onNarrationConflict]
    );

    /**
     * Gọi khi kết thúc phát (audio ended hoặc user bấm Stop).
     */
    const finishNarration = useCallback(async (duration: number): Promise<void> => {
        isPlayingRef.current = false;
        currentPoiRef.current = null;
        if (currentLogIdRef.current) {
            try {
                await endNarration(currentLogIdRef.current, duration);
            } catch {
                // Offline: sync sau
            }
            currentLogIdRef.current = null;
        }
    }, []);

    return { triggerNarration, finishNarration };
}
