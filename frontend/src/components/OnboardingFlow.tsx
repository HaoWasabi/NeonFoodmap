import { useEffect, useRef, useState } from 'react';
import { initUser, getUserAuthSession } from '../services/api';
import { useDeviceId } from '../hooks/useDeviceId';
import { useApp } from '../context/AppContext';
import { DEFAULT_VOICE_REGION, type Language } from '../types';
import { ShellIcon } from './FoodmapShell';

interface OnboardingFlowProps {
    open: boolean;
    onComplete: () => void;
}

const stories = [
    {
        index: '01 / 03',
        location: 'Cổng phố Vĩnh Khánh',
        title: <>BƯỚC VÀO<br />PHỐ VỊ GIÁC</>,
        time: <>Q4 · TP.HCM<br />18:30</>,
        copy: 'Từ cổng phố, tiếng bếp, tiếng xe và lời mời gọi dần trở thành lớp âm thanh mở đầu cho hành trình.',
        stop: 'Cổng Vĩnh Khánh',
        stopCopy: 'Mở đầu tuyến phố',
    },
    {
        index: '02 / 03',
        location: 'Nhịp đêm phố ốc',
        title: <>NGHE BẾP<br />LÊN ĐÈN</>,
        time: <>STOP 02<br />20:05</>,
        copy: 'Mỗi quán là một trường âm riêng: tiếng chảo nóng, vỏ ốc chạm đĩa và câu chuyện của người bán.',
        stop: 'Phố ốc đêm',
        stopCopy: 'Âm thanh bếp mở',
    },
    {
        index: '03 / 03',
        location: 'Ngõ vào Chợ Xóm Chiếu',
        title: <>MANG THEO<br />MỘT KÝ ỨC</>,
        time: <>STOP 03<br />21:20</>,
        copy: 'Điểm kết nối phố ăn với nhịp sống khu chợ — nơi hành trình khép lại bằng một ký ức có mùi, vị và âm thanh.',
        stop: 'Xóm Chiếu',
        stopCopy: 'Điểm kết hành trình',
    },
];

function StoryArtwork({ index }: { index: number }) {
    if (index === 1) {
        return <img className="foodmap-scene-illustration" src="https://images.unsplash.com/photo-1583417319070-4a69db38a482?auto=format&fit=crop&w=1200&q=80" alt="Chợ Bến Thành, TP.HCM" style={{ filter: 'grayscale(100%)' }} />;
    }
    if (index === 2) {
        return <img className="foodmap-scene-illustration" src="https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=1200&q=80" alt="Hội An đêm" style={{ filter: 'grayscale(100%)' }} />;
    }
    return <img className="foodmap-scene-illustration" src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80" alt="Cổng phố Vĩnh Khánh" style={{ filter: 'grayscale(100%)' }} />;
}

export default function OnboardingFlow({ open, onComplete }: OnboardingFlowProps) {
    const deviceId = useDeviceId();
    const { dispatch, isOnline } = useApp();
    const [stage, setStage] = useState<'splash' | 'welcome'>('splash');
    const [storyIndex, setStoryIndex] = useState(0);
    const [permissions, setPermissions] = useState({ location: false, notification: false });
    const [error, setError] = useState<string | null>(null);
    const initialized = useRef(false);
    const previousOpen = useRef(open);
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    useEffect(() => {
        if (open && !previousOpen.current) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setStage('splash');
            setStoryIndex(0);
            setPermissions({ location: false, notification: false });
            setError(null);
        }
        previousOpen.current = open;
    }, [open]);

    useEffect(() => {
        if (!open || initialized.current) return;
        initialized.current = true;
        const initialize = async () => {
            if (!isOnline) {
                if (localStorage.getItem('bcsd_offline_mode') === 'true') {
                    dispatch({ type: 'SET_OFFLINE_READY', payload: true });
                } else {
                    setError('Không có kết nối. Hãy thử lại khi online hoặc bật dữ liệu offline.');
                }
                return;
            }
            try {
                const user = await initUser(deviceId);
                const savedLang = localStorage.getItem('bcsd_language');
                dispatch({ type: 'SET_USER', payload: { ...user, preferred_language: (savedLang as Language) || user.preferred_language || 'vi', preferred_voice_region: DEFAULT_VOICE_REGION } });
            } catch {
                const session = getUserAuthSession();
                if (session?.user) {
                    dispatch({ type: 'SET_USER', payload: { ...session.user, device_id: session.user.device_id || deviceId, preferred_voice_region: DEFAULT_VOICE_REGION } });
                } else {
                    dispatch({ type: 'SET_USER', payload: { id: deviceId, device_id: deviceId, preferred_language: 'vi', preferred_voice_region: DEFAULT_VOICE_REGION } });
                }
            }
        };
        void initialize();
    }, [deviceId, dispatch, isOnline, open]);

    useEffect(() => {
        if (!open || stage !== 'splash') return;
        const timer = window.setTimeout(() => setStage('welcome'), reduceMotion ? 50 : 3200);
        return () => window.clearTimeout(timer);
    }, [open, reduceMotion, stage]);

    useEffect(() => {
        if (!open || stage !== 'welcome' || reduceMotion) return;
        const timer = window.setInterval(() => setStoryIndex((index) => (index + 1) % stories.length), 4800);
        return () => window.clearInterval(timer);
    }, [open, reduceMotion, stage]);

    if (!open) return null;

    const requestPermission = async (kind: 'location' | 'notification') => {
        if (kind === 'location' && 'geolocation' in navigator) {
            await new Promise<void>((resolve) => navigator.geolocation.getCurrentPosition(() => resolve(), () => resolve(), { timeout: 5000 }));
        }
        if (kind === 'notification' && 'Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission();
        }
        setPermissions((current) => ({ ...current, [kind]: true }));
    };
    const enterApplication = () => {
        localStorage.setItem('nf_onboarding_complete', 'true');
        onComplete();
    };
    const permissionCount = Number(permissions.location) + Number(permissions.notification);

    return (
        <main className="foodmap-onboarding" aria-label="Luồng onboarding NeonFoodmap">
            <section className={`foodmap-onboard-stage foodmap-splash${stage === 'splash' ? ' is-visible' : ''}`} aria-hidden={stage !== 'splash'}>

                <div className="foodmap-splash-inner">
                    <svg className="foodmap-splash-wordmark" viewBox="0 0 900 220" role="img" aria-label="NeonFoodmap"><text x="450" y="154" textAnchor="middle">NeonFoodmap</text></svg>
                    <p className="foodmap-body">Thuyết minh di sản &amp; ẩm thực phố</p>
                    <div className="foodmap-splash-meta foodmap-label"><span>Geofence Audio</span><span>VI · EN · FR</span><span>Offline Ready</span></div>
                    {error && <div className="foodmap-onboarding-error" role="alert"><p>{error}</p><button className="foodmap-btn foodmap-btn-secondary" type="button" onClick={() => window.location.reload()}>Thử lại</button></div>}
                </div>
                <div className="foodmap-splash-progress" aria-hidden="true"><span /></div>
            </section>

            <section className={`foodmap-onboard-stage foodmap-welcome${stage === 'welcome' ? ' is-visible' : ''}`} aria-hidden={stage !== 'welcome'}>
                <div className="foodmap-welcome-visual">
                    <div className="foodmap-story-track" style={{ transform: `translate3d(${storyIndex * -(100 / stories.length)}%, 0, 0)` }}>
                        {stories.map((item, index) => <article className={`foodmap-story-scene${index === storyIndex ? ' is-active' : ''}`} key={item.index}><StoryArtwork index={index} /><div className="foodmap-scene-scrim" /><div className="foodmap-visual-copy"><div className="foodmap-visual-index foodmap-label"><span>{item.index}</span><span>{item.location}</span></div><h2 className="foodmap-display">{item.title}</h2><div className="foodmap-visual-caption"><span className="foodmap-mono">{item.time}</span><p className="foodmap-body">{item.copy}</p></div></div></article>)}
                    </div>

                </div>

                <div className="foodmap-welcome-panel">
                    <div className="foodmap-panel-top"><span className="foodmap-brand-script">NeonFoodmap</span></div>
                    <div className="foodmap-welcome-heading"><span className="foodmap-label">Vĩnh Khánh Night Food Walk · 03 chương tự dẫn</span><h1 className="foodmap-display">PHỐ KỂ<br />BẠN NGHE</h1><p className="foodmap-body">Bật hai quyền cốt lõi để audio tự mở đúng điểm dừng và luôn sẵn sàng trên màn hình khóa.</p></div>
                    <div className="foodmap-route-ledger" aria-label="Ba điểm trong hành trình">{stories.map((item, index) => <button className={`foodmap-route-stop${index === storyIndex ? ' is-active' : ''}`} type="button" key={item.stop} onClick={() => setStoryIndex(index)}><span className="foodmap-mono">0{index + 1}</span><span><strong>{item.stop}</strong><small>{item.stopCopy}</small></span></button>)}</div>
                    <section className="foodmap-permission-card" aria-labelledby="permissionTitle"><div className="foodmap-permission-card-head"><div><span className="foodmap-label">Thiết lập nhanh</span><h2 id="permissionTitle">Chuẩn bị trải nghiệm</h2></div><span className="foodmap-mono">01 quyền</span></div>{(['location'] as const).map((kind) => <div className="foodmap-permission-row" key={kind}><div className="foodmap-permission-icon"><ShellIcon name={kind === 'location' ? 'map' : 'playlist'} /></div><div className="foodmap-permission-copy"><h3>{kind === 'location' ? 'Vị trí chính xác' : 'Thông báo & media'}</h3><p>{kind === 'location' ? 'Kích hoạt audio khi tiến gần POI.' : 'Giữ điều khiển khi màn hình khóa.'}</p></div><button className={`foodmap-permission-action${permissions[kind] ? ' is-granted' : ''}`} type="button" aria-pressed={permissions[kind]} onClick={() => void requestPermission(kind)}>{permissions[kind] ? 'Đã bật' : 'Cho phép'}</button></div>)}<div className="foodmap-permission-footer"><div className={`foodmap-permission-status${permissionCount === 1 ? ' is-ready' : ''}`}><span className="foodmap-status-square" />{permissionCount} / 1 quyền đã sẵn sàng</div><button className="foodmap-btn foodmap-btn-primary" type="button" onClick={enterApplication}>Khám phá ngay</button></div></section>
                </div>
            </section>
        </main>
    );
}
