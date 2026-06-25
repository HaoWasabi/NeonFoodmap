import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { initUser, getUserAuthSession } from '../services/api';
import { useDeviceId } from '../hooks/useDeviceId';
import { useApp } from '../context/AppContext';

export default function SplashScreen() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const deviceId = useDeviceId();
    const { dispatch, isOnline } = useApp();
    const [phase, setPhase] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const initialized = useRef(false);

    const PHASES = [
        t('splash.initDevice'),
        t('splash.checkConnection'),
        t('splash.requestLocation'),
        t('splash.requestNotification'),
        t('splash.ready'),
    ];

    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;

        const run = async () => {
            // Phase 0 → 1: Init device
            await delay(800);
            setPhase(1);

            // Phase 1: Check network
            if (!isOnline) {
                const offlineReady = localStorage.getItem('bcsd_offline_mode') === 'true';
                if (!offlineReady) {
                    setError(t('splash.noNetwork'));
                    return;
                }
                dispatch({ type: 'SET_OFFLINE_READY', payload: true });
                await delay(600);
                setPhase(2);
            } else {
                // Phase 1 → 2: API init user
                try {
                    const user = await initUser(deviceId);
                    
                    // Merge with localStorage preferences to prevent reset
                    const savedLang = localStorage.getItem('bcsd_language');
                    const savedRegion = localStorage.getItem('bcsd_voice_region');
                    
                    const mergedUser = {
                        ...user,
                        preferred_language: (savedLang as any) || user.preferred_language || 'vi',
                        preferred_voice_region: (savedRegion as any) || user.preferred_voice_region || 'mien_nam',
                    };
                    
                    dispatch({ type: 'SET_USER', payload: mergedUser });
                } catch {
                    // Backend không có /users/init/ hoặc lỗi mạng — giữ JWT user nếu đã đăng nhập
                    const savedLang = localStorage.getItem('bcsd_language');
                    const savedRegion = localStorage.getItem('bcsd_voice_region');
                    const session = getUserAuthSession();
                    if (session?.user) {
                        dispatch({
                            type: 'SET_USER',
                            payload: {
                                ...session.user,
                                device_id: session.user.device_id || deviceId,
                                preferred_language: (savedLang as any) || session.user.preferred_language || 'vi',
                                preferred_voice_region:
                                    (savedRegion as any) || session.user.preferred_voice_region || 'mien_nam',
                            },
                        });
                    } else {
                        dispatch({
                            type: 'SET_USER',
                            payload: {
                                id: deviceId,
                                device_id: deviceId,
                                preferred_language: (savedLang as any) || 'vi',
                                preferred_voice_region: (savedRegion as any) || 'mien_nam',
                            },
                        });
                    }
                }
                setPhase(2);
            }

            // Phase 2: Request location permission
            await delay(600);
            try {
                await new Promise<void>((resolve) => {
                    navigator.geolocation.getCurrentPosition(() => resolve(), () => resolve(), { timeout: 5000 });
                });
            } catch {
                /* bỏ qua nếu không cấp */
            }

            setPhase(3);

            // Phase 3: Request notification permission (cho Media Player trên lock screen)
            await delay(500);
            try {
                if ('Notification' in window && Notification.permission === 'default') {
                    await Notification.requestPermission();
                }
            } catch {
                /* bỏ qua nếu không hỗ trợ */
            }

            setPhase(4);
            await delay(700);
            navigate('/map', { replace: true });
        };

        run();
    }, [deviceId, dispatch, isOnline, navigate, t]);

    const progress = ((phase + 1) / PHASES.length) * 100;

    return (
        <div className="relative flex min-h-screen w-full flex-col items-center justify-between overflow-hidden bg-gradient-to-b from-primary to-[#FFF8F0]">
            {/* Decorative blobs */}
            <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl pointer-events-none" />

            {/* Spacer */}
            <div className="h-20" />

            {/* Center content */}
            <div className="flex flex-col items-center gap-6 px-4">
                <div className="flex h-[120px] w-[120px] items-center justify-center rounded-3xl bg-white shadow-xl shadow-primary/20">
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: 80, fontVariationSettings: "'FILL' 1" }}>
                        soup_kitchen
                    </span>
                </div>
                <div className="text-center">
                    <h1 className="text-[40px] font-bold leading-tight tracking-tight text-white drop-shadow-md">
                        {t('splash.appTitle')}
                    </h1>
                    <p className="mt-2 text-lg font-medium text-white/90">{t('splash.appSubtitle')}</p>
                </div>
            </div>

            {/* Bottom loading */}
            <div className="w-full max-w-md px-8 pb-16">
                {error ? (
                    <div className="rounded-xl bg-white/20 p-4 text-center backdrop-blur-sm">
                        <span className="material-symbols-outlined text-white text-3xl mb-2 block">wifi_off</span>
                        <p className="text-sm font-medium text-white">{error}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="mt-3 rounded-full bg-white px-6 py-2 text-sm font-bold text-primary"
                        >
                            {t('common.retry')}
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        <p className="text-center text-sm font-medium text-white/80">
                            {PHASES[Math.min(phase, PHASES.length - 1)]}
                        </p>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/30">
                            <div
                                className="h-full rounded-full bg-white shadow-sm transition-all duration-500"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}
