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
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const scanIntervalRef = useRef<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const captureInputRef = useRef<HTMLInputElement>(null);
    const startedRef = useRef(false);

    const handlePOI = useCallback(async (poi: POI) => {
        navigate('/map', { state: { qrPOI: poi } });
        onScanSuccess(poi);
    }, [navigate, onScanSuccess]);

    /** URL /map?poi=&qr= từ mã QR in tại quán */
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
        // URL pattern
        try {
            const url = new URL(text);
            const idFromParam = url.searchParams.get('poi') ||
                url.searchParams.get('id') ||
                url.searchParams.get('code');
            if (idFromParam) return idFromParam;

            const pathSegments = url.pathname.split('/').filter(Boolean);
            for (let i = 0; i < pathSegments.length; i++) {
                if ((pathSegments[i] === 'pois' || pathSegments[i] === 'poi') && pathSegments[i + 1]) {
                    if (/^\d+$/.test(pathSegments[i + 1])) return pathSegments[i + 1];
                }
            }

            const lastSegment = pathSegments[pathSegments.length - 1];
            if (lastSegment && /^\d+$/.test(lastSegment)) return lastSegment;
        } catch {
            // Not a valid URL
        }

        // JSON pattern
        try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object') {
                if (parsed.id) return parsed.id.toString();
                if (parsed.poiId) return parsed.poiId.toString();
            }
        } catch {
            // Not JSON
        }

        // Simple numeric string or POI_ pattern
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

        // Dừng scan interval
        if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
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

    const stopCamera = useCallback(() => {
        if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    // Scan frames from video using html5-qrcode's scanFile on canvas blob
    const startScanning = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        let html5QrInstance: import('html5-qrcode').Html5Qrcode | null = null;

        const initDecoder = async () => {
            const { Html5Qrcode } = await import('html5-qrcode');
            html5QrInstance = new Html5Qrcode('bcsd-qr-reader', { verbose: false });
        };

        initDecoder().then(() => {
            scanIntervalRef.current = window.setInterval(async () => {
                if (processedRef.current || !html5QrInstance) return;
                if (video.readyState < video.HAVE_ENOUGH_DATA) return;

                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0);

                try {
                    const blob = await new Promise<Blob | null>((resolve) =>
                        canvas.toBlob(resolve, 'image/png')
                    );
                    if (!blob || processedRef.current) return;

                    const file = new File([blob], 'frame.png', { type: 'image/png' });
                    const decodedText = await html5QrInstance!.scanFile(file, false);
                    if (decodedText && !processedRef.current) {
                        handleQRResult(decodedText);
                    }
                } catch {
                    // No QR found in this frame - normal
                }
            }, 300); // Scan every 300ms
        });
    }, [handleQRResult]);

    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;

        let unmounted = false;

        const initCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: false,
                });

                if (unmounted) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }

                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play().catch(() => {});
                }

                // Bắt đầu scan sau khi video ready
                setTimeout(() => {
                    if (!unmounted) startScanning();
                }, 500);
            } catch (err) {
                console.error('[QR Camera] getUserMedia failed:', err);
                if (!unmounted) setCameraError(true);
            }
        };

        initCamera();

        return () => {
            unmounted = true;
            startedRef.current = false;
            stopCamera();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setScanOk(true);

        try {
            const { Html5Qrcode } = await import('html5-qrcode');
            const html5Qr = new Html5Qrcode('bcsd-qr-reader', { verbose: false });
            const decodedText = await html5Qr.scanFile(file, true);
            console.log(`[QR Scan] Successfully decoded from file: ${decodedText}`);
            handleQRResult(decodedText);
        } catch (err) {
            console.error('[QR Scan] File scan failed:', err);
            setScanOk(false);
            processedRef.current = false;
            const errorMsg = t('Invalid File!') || 'Không thể đọc mã QR từ ảnh này.';
            alert(errorMsg);
        } finally {
            e.target.value = '';
        }
    };

    const handleClose = useCallback(() => {
        stopCamera();
        onClose();
    }, [onClose, stopCamera]);

    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-between text-white overflow-hidden bg-black">
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
            />
            {/* Separate input without capture for gallery-only picking */}
            <input
                type="file"
                ref={captureInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileSelect}
            />

            {/* Hidden container for html5-qrcode internal use */}
            <div id="bcsd-qr-reader" />

            {/* Hidden canvas for frame capture */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Native video element - full screen camera preview */}
            <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover z-0"
                autoPlay
                playsInline
                muted
            />

            {/* Vignette overlay - chỉ tối nhẹ ở viền, giữ trung tâm sáng */}
            <div
                className="absolute inset-0 z-[1] pointer-events-none"
                style={{
                    background: 'radial-gradient(ellipse 55% 45% at center, transparent 0%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.6) 100%)',
                }}
            />

            {/* Top nav */}
            <div className="relative z-20 w-full flex items-center justify-between p-6">
                <button onClick={handleClose} className="btn btn-ghost text-white border-white/20 hover:border-primary flex items-center gap-2">
                    <span className="material-symbols-outlined">arrow_back</span>
                    <span className="t-body font-bold">{t('common.cancel')}</span>
                </button>
            </div>

            {/* Scan frame */}
            <div className="relative z-10 flex flex-col items-center justify-center flex-1 w-full">
                <div className="relative size-64 sm:size-72">
                    <div className="absolute -top-1 -left-1 size-10 border-t-4 border-l-4 border-primary rounded-none" />
                    <div className="absolute -top-1 -right-1 size-10 border-t-4 border-r-4 border-primary rounded-none" />
                    <div className="absolute -bottom-1 -left-1 size-10 border-b-4 border-l-4 border-primary rounded-none" />
                    <div className="absolute -bottom-1 -right-1 size-10 border-b-4 border-r-4 border-primary rounded-none" />

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
                    <h3 className="text-white t-title text-xl drop-shadow-lg">
                        {scanOk ? 'Đang xử lý...' : t('qr.scanTitle')}
                    </h3>
                    <p className="text-white/80 t-body mt-2 leading-relaxed drop-shadow">{t('qr.scanDescription')}</p>

                    {cameraError && !scanOk && (
                        <div className="mt-4 flex flex-col items-center gap-3">
                            <p className="text-amber-300 t-mono text-xs bg-amber-500/20 border border-amber-400/30 rounded-none px-4 py-2 text-center">
                                📵 Camera không khả dụng trên HTTP.<br/>Cần HTTPS để quét trực tiếp.
                            </p>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="px-5 py-2.5 bg-primary text-white font-bold rounded-none flex items-center gap-2 active:scale-95 transition-transform"
                            >
                                <span className="material-symbols-outlined text-xl">photo_camera</span>
                                Chụp ảnh QR
                            </button>
                            <button
                                onClick={() => captureInputRef.current?.click()}
                                className="px-5 py-2.5 bg-white/10 border border-white/30 text-white font-bold rounded-none flex items-center gap-2 active:scale-95 transition-transform"
                            >
                                <span className="material-symbols-outlined text-xl">image</span>
                                Chọn từ thư viện
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom controls */}
            <div className="relative z-20 w-full flex flex-col items-center gap-4 pb-10">
                <div className="flex items-center justify-center gap-10">
                    <div className="flex flex-col items-center gap-2">
                        <button
                            onClick={() => captureInputRef.current?.click()}
                            className="btn-icon bg-black/40 backdrop-blur-xl border border-white/30 text-white active:bg-primary transition-colors flex items-center justify-center"
                        >
                            <span className="material-symbols-outlined text-2xl">image</span>
                        </button>
                        <span className="t-label text-white/80">{t('qr.gallery')}</span>
                    </div>

                    <div className="flex flex-col items-center gap-2">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex size-14 items-center justify-center border-2 border-primary bg-white text-primary rounded-none active:scale-95 transition-transform"
                        >
                            <span className="material-symbols-outlined text-3xl">photo_camera</span>
                        </button>
                        <span className="t-label text-white/80">{cameraError ? 'Chụp QR' : ''}</span>
                    </div>
                </div>
                <div className="w-32 h-1.5 bg-white/20 rounded-full" />
            </div>
        </div>
    );
}
