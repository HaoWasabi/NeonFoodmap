import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

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
    const { t } = useTranslation();

    return (
        <nav className="border-t border-slate-200/60 bg-white/95 backdrop-blur-xl safe-bottom">
            <div className="mx-auto w-full max-w-2xl lg:max-w-4xl flex items-center justify-between px-4 pt-2 pb-3">
                {NAV_ITEMS.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                        <button
                            key={item.path}
                            onClick={() => navigate(item.path)}
                            className={`flex flex-1 flex-col items-center gap-1 tap-scale transition-all duration-200 ${isActive ? 'text-primary' : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            <span
                                className={`material-symbols-outlined text-[24px] transition-transform duration-200 ${isActive ? 'animate-pop-in' : ''
                                    }`}
                                style={{
                                    fontVariationSettings: isActive && item.iconFill ? "'FILL' 1" : "'FILL' 0",
                                }}
                            >
                                {item.icon}
                            </span>
                            <span className={`text-[10px] font-bold uppercase tracking-tighter transition-colors ${isActive ? 'text-primary' : ''
                                }`}>
                                {t(item.labelKey)}
                            </span>
                            {/* Active indicator dot */}
                            {isActive && (
                                <div className="w-1 h-1 rounded-full bg-primary animate-pop-in" />
                            )}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
