import type { ReactNode } from 'react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import BottomNavBar from './BottomNavBar';

type IconName = 'map' | 'route' | 'offline' | 'settings' | 'chevron-left' | 'chevron-right' | 'chevron-up' | 'chevron-down' | 'mic' | 'qr' | 'volume' | 'playlist' | 'play' | 'pause' | 'search' | 'expand' | 'star';

const ICONS: Record<IconName, ReactNode> = {
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" /><path d="M9 3v15M15 6v15" /></>,
    route: <><path d="M4 19V5h16v14H4Z" /><path d="M8 9h8M8 13h5" /></>,
    offline: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56V20h-3v-.08A1.7 1.7 0 0 0 10.66 18.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 14.74a1.7 1.7 0 0 0-1.56-1.04H5v-3h.44A1.7 1.7 0 0 0 7 9.66a1.7 1.7 0 0 0-.34-1.88l-.06-.06L8.72 5.6l.06.06A1.7 1.7 0 0 0 10.66 6 1.7 1.7 0 0 0 11.7 4.44V4h3v.44A1.7 1.7 0 0 0 15.74 6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.04H21v3h-.04A1.7 1.7 0 0 0 19.4 15Z" /></>,
    'chevron-left': <path d="m15 5-7 7 7 7" />,
    'chevron-right': <path d="m9 5 7 7-7 7" />,
    'chevron-up': <path d="m5 15 7-7 7 7" />,
    'chevron-down': <path d="m5 9 7 7 7-7" />,
    mic: <><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
    qr: <><path d="M4 4h5M4 4v5M20 4h-5M20 4v5M4 20h5M4 20v-5M20 20h-5M20 20v-5" /><path d="M9 9h6v6H9Z" /></>,
    volume: <><path d="M4 10v4h4l5 4V6l-5 4H4Z" /><path d="M17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" /></>,
    playlist: <><path d="M4 6h16M4 12h16M4 18h10" /></>,
    play: <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none" />,
    pause: <><path d="M8 5v14M16 5v14" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    expand: <><path d="m7 14 5-5 5 5" /></>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
};

function ShellIcon({ name, className = 'foodmap-icon' }: { name: IconName; className?: string }) {
    return <svg className={className} viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>;
}

const NAV_ITEMS: Array<{ icon: IconName; label: string; path: string; index: string }> = [
    { icon: 'map', label: 'Bản đồ', path: '/map', index: '01' },
    { icon: 'route', label: 'Hành trình', path: '/tours', index: '02' },
    { icon: 'offline', label: 'Tải về', path: '/offline', index: '03' },
    { icon: 'settings', label: 'Cài đặt', path: '/settings', index: '04' },
];

interface FoodmapShellProps {
    children: ReactNode;
    workspaceOverlay?: ReactNode;
    overlayOpen?: boolean;
    variant?: 'default' | 'map';
    searchValue?: string;
    onSearchChange?: (value: string) => void;
    searchPlaceholder?: string;
    onQrScan?: () => void;
    hideAudio?: boolean;
    hideBottomNav?: boolean;
    contentClassName?: string;
    topRight?: ReactNode;
    routeMark?: string;
    routeTitle?: string;
    routeMeta?: string;
    routeProgress?: number;
    hideTopbar?: boolean;
}

export default function FoodmapShell({
    children,
    workspaceOverlay,
    overlayOpen = false,
    variant = 'default',
    searchValue,
    onSearchChange,
    searchPlaceholder = 'TÌM POI, MÓN ĂN, HÀNH TRÌNH…',
    onQrScan,
    hideAudio = false,
    hideBottomNav = false,
    contentClassName = '',
    topRight,
    routeMark,
    routeTitle,
    routeMeta,
    routeProgress,
    hideTopbar = false,
}: FoodmapShellProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation();
    const { user } = useApp();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const hasCustomSearch = typeof onSearchChange === 'function';

    const isActive = (path: string) => location.pathname === path || (path === '/tours' && location.pathname.startsWith('/tours/'));
    const openQr = onQrScan || (() => navigate('/map'));
    const userName = user?.full_name || user?.username || 'Hoàng Minh';

    return (
        <div className={`foodmap-shell foodmap-shell-${variant}${isCollapsed ? ' is-collapsed' : ''}${overlayOpen ? ' has-workspace-overlay' : ''}${hideAudio ? ' has-no-audio' : ''}${hideTopbar ? ' has-no-topbar' : ''}`}>
            <aside className="foodmap-sidebar" aria-label="Điều hướng chính">
                <div className="foodmap-sidebar-head">
                    <div className="foodmap-sidebar-brand">
                        <span className="foodmap-brand-square" />
                        <span className="foodmap-sidebar-wordmark">
                            <strong>NeonFoodmap</strong>
                            <small>Audio city guide</small>
                        </span>
                    </div>
                    <button
                        className="foodmap-sidebar-toggle"
                        type="button"
                        aria-label={isCollapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
                        aria-expanded={!isCollapsed}
                        onClick={() => setIsCollapsed((value) => !value)}
                    >
                        <ShellIcon name={isCollapsed ? 'chevron-right' : 'chevron-left'} />
                    </button>
                </div>

                <nav className="foodmap-sidebar-nav">
                    {NAV_ITEMS.map((item) => (
                        <button
                            key={item.path}
                            className={`foodmap-nav-item${isActive(item.path) ? ' is-active' : ''}`}
                            type="button"
                            aria-current={isActive(item.path) ? 'page' : undefined}
                            onClick={() => navigate(item.path)}
                        >
                            <span className="foodmap-nav-icon"><ShellIcon name={item.icon} /></span>
                            <span className="foodmap-nav-label">{t(`nav.${item.path === '/map' ? 'map' : item.path === '/tours' ? 'tours' : item.path === '/offline' ? 'offline' : 'me'}`, { defaultValue: item.label })}</span>
                        </button>
                    ))}
                </nav>

                <section className="foodmap-sidebar-route" aria-label="Hành trình đang hoạt động">
                    <span className="foodmap-sidebar-route-mark">{routeMark ?? 'VK'}</span>
                    <div className="foodmap-sidebar-route-copy">
                        <span className="foodmap-label">Live route</span>
                        <strong>{routeTitle ?? 'Vĩnh Khánh Night Food Walk'}</strong>
                        <span className="foodmap-mono">{routeMeta ?? '02 / 08 · 1.2 KM'}</span>
                    </div>
                    <div className="foodmap-sidebar-route-progress"><span style={routeProgress !== undefined ? { width: `${routeProgress}%` } : undefined} /></div>
                </section>

                <div className="foodmap-sidebar-foot">
                    <div className="foodmap-sidebar-foot-row">
                        <span className="foodmap-nav-icon"><span className="foodmap-chip foodmap-chip-primary">VI</span></span>
                        <span className="foodmap-sidebar-foot-copy"><strong>{userName}</strong>Quận 4 · GPS chính xác</span>
                    </div>
                </div>
            </aside>

            <div className="foodmap-workspace">
                {!hideTopbar && (
                    <>
                        <header className="foodmap-topbar">
                            <label className={`foodmap-search${hasCustomSearch ? ' is-controlled' : ''}`}>
                                <ShellIcon name="search" />
                                <span className="sr-only">Tìm điểm tham quan</span>
                                <input
                                    type="search"
                                    value={searchValue ?? ''}
                                    placeholder={searchPlaceholder}
                                    onChange={(event) => onSearchChange?.(event.target.value)}
                                    readOnly={!hasCustomSearch}
                                    aria-label="Tìm điểm tham quan"
                                />
                            </label>
                            {topRight || (
                                <>
                                    <button className="foodmap-top-control foodmap-voice-control" type="button">
                                        <ShellIcon name="mic" />Giọng Trung
                                    </button>
                                    <button className="foodmap-top-control" type="button" onClick={openQr}>
                                        <ShellIcon name="qr" />Quét QR
                                    </button>
                                    <button className="foodmap-top-control foodmap-gps-live" type="button">
                                        <span className="foodmap-gps-dot" />GPS Live
                                    </button>
                                </>
                            )}
                        </header>

                        <header className="foodmap-mobile-header">
                            <div className="foodmap-mobile-brand"><span className="foodmap-brand-square" /><span>NeonFoodmap</span></div>
                            <div className="foodmap-mobile-actions">
                                <button className="foodmap-mobile-action" type="button" onClick={() => navigate('/settings')} aria-label="Đổi ngôn ngữ"><span className="foodmap-label">VI</span></button>
                                <button className="foodmap-mobile-action foodmap-gps-live" type="button" aria-label="GPS đang hoạt động"><span className="foodmap-gps-dot" /></button>
                            </div>
                        </header>
                    </>
                )}

                <main className={`foodmap-viewport ${contentClassName}`}>{children}</main>

                {workspaceOverlay}

                {!hideAudio && (
                    <footer className="foodmap-audio-dock" aria-label="Trình phát âm thanh">
                        <button className="foodmap-audio-play" type="button" aria-label={isPlaying ? 'Tạm dừng' : 'Phát'} onClick={() => setIsPlaying((value) => !value)}>
                            <ShellIcon name={isPlaying ? 'pause' : 'play'} className="foodmap-icon foodmap-icon-large" />
                        </button>
                        <div className="foodmap-audio-copy"><strong>Chương 2 — Phố ốc lên đèn</strong><span>Vĩnh Khánh · Night Food Walk</span></div>
                        <div className="foodmap-audio-progress">
                            <div className="foodmap-waveform" aria-hidden="true">{[8, 15, 24, 13, 30, 20, 35, 18, 26, 14, 31, 22, 11, 28, 19, 33, 16, 25, 9, 29, 17, 34, 13, 23, 18, 30, 12, 26, 20, 31, 15, 27].map((height, index) => <span key={index} className={index < 14 ? 'is-played' : ''} style={{ height }} />)}</div>
                            <div className="foodmap-audio-time"><span>02:14</span><span>05:40</span></div>
                        </div>
                        <div className="foodmap-audio-tools"><span className="foodmap-chip foodmap-chip-outline">VI</span><button className="foodmap-icon-button" type="button" aria-label="Âm lượng"><ShellIcon name="volume" /></button><button className="foodmap-icon-button" type="button" aria-label="Mở danh sách phát"><ShellIcon name="playlist" /></button></div>
                    </footer>
                )}

                {!hideAudio && (
                    <footer className="foodmap-mobile-player" aria-label="Trình phát âm thanh thu gọn">
                        <button className="foodmap-audio-play" type="button" aria-label={isPlaying ? 'Tạm dừng' : 'Phát'} onClick={() => setIsPlaying((value) => !value)}><ShellIcon name={isPlaying ? 'pause' : 'play'} /></button>
                        <div className="foodmap-mobile-player-copy"><strong>Phố ốc lên đèn</strong><span>Vĩnh Khánh · 02:14 / 05:40</span></div>
                        <button className="foodmap-icon-button" type="button" aria-label="Mở trình phát"><ShellIcon name="expand" /></button>
                    </footer>
                )}

                {!hideBottomNav && <BottomNavBar />}
            </div>
        </div>
    );
}

export { ShellIcon };
