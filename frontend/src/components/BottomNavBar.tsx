import { useNavigate, useLocation } from 'react-router-dom';

interface NavItem {
    icon: string;
    labelKey: string;
    path: string;
    iconFill?: boolean;
}

const NAV_ITEMS: NavItem[] = [
    { icon: 'map', labelKey: 'nav.map', path: '/map', iconFill: true },
    { icon: 'route', labelKey: 'nav.tours', path: '/tours' },
    { icon: 'download_for_offline', labelKey: 'nav.offline', path: '/offline' },
    { icon: 'account_circle', labelKey: 'nav.me', path: '/settings' },
];

export default function BottomNavBar() {
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <nav className="foodmap-bottom-nav" aria-label="Điều hướng di động">
            {NAV_ITEMS.map((item) => {
                const isActive = location.pathname === item.path || (item.path === '/tours' && location.pathname.startsWith('/tours/'));
                return (
                    <button
                        key={item.path}
                        onClick={() => navigate(item.path)}
                        className={`foodmap-bottom-tab${isActive ? ' is-active' : ''}`}
                        aria-current={isActive ? 'page' : undefined}
                        type="button"
                    >
                        <span className="foodmap-bottom-icon material-symbols-outlined">{item.icon}</span>
                        <span>{item.labelKey === 'nav.map' ? 'Bản đồ' : item.labelKey === 'nav.tours' ? 'Hành trình' : item.labelKey === 'nav.offline' ? 'Tải về' : 'Cài đặt'}</span>
                    </button>
                );
            })}
        </nav>
    );
}
