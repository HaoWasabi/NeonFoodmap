import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { scanQRCode, getPOIById, resolveMapQrPoi } from '../services/api';
import type { POI } from '../types';

interface QRScanOverlayProps {
    onClose: () => void;
    onScanSuccess: (poi: POI) => void;
}

export default function QRScanOverlay({ onClose, onScanSuccess }: QRScanOverlayProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [scanOk, setScanOk] = useState(false);
    const [cameraError, setCameraError] = useState(false);
    const processedRef = useRef(false);
    const html5QrRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Guard chống StrictMode double-invoke
    const startedRef = useRef(false);

    const handlePOI = useCallback(async (poi: POI) => {
        navigate('/map', { state: { qrPOI: poi } });
        onScanSuccess(poi);
    }, [navigate, onScanSuccess]);

    /** URL /map?poi=&qr= từ mã QR in tại quán (chữ ký có thời hạn). */
    const extractMapQrFromUrl = (text: string): { poiId: string; qrToken: string } | null => {
        try {
            const url = text.startsWith('http://') || text.startsWith('https://')
                ? new URL(text)
                : new URL(text, window.location.origin);
            const poi = url.searchParams.get('poi') || url.searchParams.get('id');
            const qr = url.searchParams.get('qr');
            if (poi && qr && /^\/map(\/|$)/.test(url.pathname)) {
                return { poiId: poi, qrToken: qr };
            }
        } catch {
            /* not a URL */
        }
        return null;
    };

    const extractPoiId = (text: string): string | null => {
        // 1. URL pattern
        try {
            const url = new URL(text);
            // Check params
            const idFromParam = url.searchParams.get('poi') || 
                                url.searchParams.get('id') || 
                                url.searchParams.get('code');
            if (idFromParam) return idFromParam;
            
            // Check path segments (e.g., /pois/8 or /poi/8)
            const pathSegments = url.pathname.split('/').filter(Boolean);
            for (let i = 0; i < pathSegments.length; i++) {
                if ((pathSegments[i] === 'pois' || pathSegments[i] === 'poi') && pathSegments[i+1]) {
                    if (/^\d+$/.test(pathSegments[i+1])) return pathSegments[i+1];
                }
            }
            
            // Check if the last segment is a number (e.g., /8/)
            const lastSegment = pathSegments[pathSegments.length - 1];
            if (lastSegment && /^\d+$/.test(lastSegment)) return lastSegment;
            
        } catch {
            // Not a valid URL
        }

        // 2. JSON pattern
        try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object') {
                if (parsed.id) return parsed.id.toString();
                if (parsed.poiId) return parsed.poiId.toString();
            }
        } catch {
            // Not JSON
        }

        // 3. Simple numeric string or "POI_8" pattern
        const trimmed = text.trim();
        if (/^\d+$/.test(trimmed)) return trimmed;
        
        const bcsdMatch = trimmed.match(/POI_(\d+)/i) || trimmed.match(/BCSD-POI-(\d+)/i);
        if (bcsdMatch) return bcsdMatch[1];

        return null;
    };

    const handleQRResult = useCallback(async (decodedText: string) => {
        if (processedRef.current) return;
        processedRef.current = true;
        setScanOk(true);

        if (html5QrRef.current && html5QrRef.current.isScanning) {
            html5QrRef.current.stop().catch(() => {});
        }

        try {
            let poi;
            const mapQr = extractMapQrFromUrl(decodedText.trim());
            if (mapQr) {
                console.log(`[QR Scan] Signed map QR for POI ${mapQr.poiId}`);
                poi = await resolveMapQrPoi(mapQr.poiId, mapQr.qrToken);
            } else {
                const poiId = extractPoiId(decodedText);

                if (poiId) {
                    console.log(`[QR Scan] Extracted POI ID: ${poiId}`);
                    poi = await getPOIById(poiId);
                } else {
                    console.log(`[QR Scan] No ID extracted, calling scanQRCode for raw text: ${decodedText}`);
                    poi = await scanQRCode(decodedText);
                }
            }

            await handlePOI(poi);
        } catch (err) {
            console.error('[QR Scan] Failed processing:', err);
            const mockPoi: POI = {
                id: 'demo-001',
                name: 'Phố Ẩm Thực Vĩnh Khánh',
                description: 'Vĩnh Khánh là con phố ẩm thực nổi tiếng tại Quận 4, TP. Hồ Chí Minh.',
                latitude: 10.755,
                longitude: 106.703,
                geofence_radius: 50,
                category: 'food',
                qr_code_data: decodedText,
            };
            await handlePOI(mockPoi);
        }
    }, [handlePOI]);

    useEffect(() => {
        // Guard chống StrictMode double-invoke
        if (startedRef.current) return;
        startedRef.current = true;

        const containerId = 'bcsd-qr-reader';

        const startCamera = async () => {
            try {
                const { Html5Qrcode } = await import('html5-qrcode');
                const html5Qr = new Html5Qrcode(containerId);
                html5QrRef.current = html5Qr;

                await html5Qr.start(
                    { facingMode: 'environment' },
                    { fps: 10, qrbox: { width: 240, height: 240 } },
                    (decodedText) => handleQRResult(decodedText),
                    () => { /* ignore frame failures */ }
                );
            } catch {
                setCameraError(true);
            }
        };

        startCamera();

        return () => {
            if (html5QrRef.current) {
                if (html5QrRef.current.isScanning) {
                    html5QrRef.current.stop().catch(() => {});
                }
                html5QrRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !html5QrRef.current) return;

        setScanOk(true);
        
        try {
            // Stop camera to avoid library state conflicts while scanning file
            if (html5QrRef.current.isScanning) {
                await html5QrRef.current.stop().catch(() => {});
            }

            const decodedText = await html5QrRef.current.scanFile(file, true);
            console.log(`[QR Scan] Successfully decoded from file: ${decodedText}`);
            handleQRResult(decodedText);
        } catch (err) {
            console.error('[QR Scan] File scan failed:', err);
            setScanOk(false);
            processedRef.current = false;
            
            // Re-start camera if it was stopped
            if (html5QrRef.current && !html5QrRef.current.isScanning) {
                html5QrRef.current.start(
                    { facingMode: 'environment' },
                    { fps: 10, qrbox: { width: 240, height: 240 } },
                    (decodedText) => handleQRResult(decodedText),
                    () => { /* ignore frame failures */ }
                ).catch(() => setCameraError(true));
            }

            const errorMsg = t('qr.invalidFile') || 'Không thể đọc mã QR từ ảnh này. Vui lòng chọn ảnh rõ nét hơn hoặc có độ tương phản tốt hơn.';
            alert(errorMsg);
        } finally {
            // Reset input so the same file can be selected again if needed
            e.target.value = '';
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-between text-white overflow-hidden bg-black">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileSelect} 
            />

            {/* Camera container */}
            <div className="absolute inset-0">
                <div
                    id="bcsd-qr-reader"
                    className="absolute inset-0"
                    style={{ width: '100%', height: '100%' }}
                />
                <div className="absolute inset-0 bg-black/50 pointer-events-none" />
            </div>

            {/* Top nav */}
            <div className="relative z-20 w-full flex items-center justify-between p-6">
                <button onClick={onClose} className="flex items-center gap-2">
                    <div className="flex size-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-md">
                        <span className="material-symbols-outlined text-white">arrow_back</span>
                    </div>
                    <span className="text-white font-semibold text-lg drop-shadow-md">{t('common.cancel')}</span>
                </button>
            </div>

            {/* Scan frame */}
            <div className="relative z-10 flex flex-col items-center justify-center flex-1 w-full">
                <div className="relative size-64 sm:size-72">
                    <div className="absolute -top-1 -left-1 size-10 border-t-4 border-l-4 border-primary rounded-tl-2xl" />
                    <div className="absolute -top-1 -right-1 size-10 border-t-4 border-r-4 border-primary rounded-tr-2xl" />
                    <div className="absolute -bottom-1 -left-1 size-10 border-b-4 border-l-4 border-primary rounded-bl-2xl" />
                    <div className="absolute -bottom-1 -right-1 size-10 border-b-4 border-r-4 border-primary rounded-br-2xl" />

                    {!scanOk && !cameraError && (
                        <div className="absolute left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_12px_rgba(255,106,0,.8)] animate-scan-line" />
                    )}

                    {scanOk && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="material-symbols-outlined text-green-400 text-6xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        </div>
                    )}
                </div>

                <div className="mt-8 px-8 text-center max-w-xs">
                    <h3 className="text-white text-lg font-bold drop-shadow-lg">
                        {scanOk ? 'Đang xử lý...' : t('qr.scanTitle')}
                    </h3>
                    <p className="text-white/70 text-sm mt-2 leading-relaxed">{t('qr.scanDescription')}</p>

                    {cameraError && !scanOk && (
                        <p className="mt-4 text-amber-300 text-xs font-medium bg-amber-500/20 border border-amber-400/30 rounded-xl px-4 py-2">
                            📵 Camera không khả dụng (cần HTTPS)
                        </p>
                    )}
                </div>
            </div>

            {/* Bottom controls */}
            <div className="relative z-20 w-full flex flex-col items-center gap-4 pb-10">
                <div className="flex items-center justify-center gap-10">
                    <div className="flex flex-col items-center gap-2">
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="flex size-14 items-center justify-center rounded-full bg-black/40 backdrop-blur-xl border border-white/10 text-white active:bg-primary transition-colors"
                        >
                            <span className="material-symbols-outlined text-3xl">image</span>
                        </button>
                        <span className="text-xs font-medium text-white/80 uppercase tracking-widest">{t('qr.gallery')}</span>
                    </div>

                    <div className="flex size-20 items-center justify-center rounded-full border-4 border-primary p-1">
                        <div className="size-full rounded-full bg-white flex items-center justify-center">
                            <span className="material-symbols-outlined text-primary text-4xl">qr_code_scanner</span>
                        </div>
                    </div>
                </div>
                <div className="w-32 h-1.5 bg-white/20 rounded-full" />
            </div>
        </div>
    );
}
