import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import FoodmapShell, { ShellIcon } from './FoodmapShell';

interface AppLayoutProps {
    title: string;
    showBack?: boolean;
    backPath?: string;
    headerAction?: ReactNode;
    hideNav?: boolean;
    contentClassName?: string;
    hideTopbar?: boolean;
    children: ReactNode;
}

export default function AppLayout({
    title,
    showBack = true,
    backPath = '/map',
    headerAction,
    hideNav = false,
    contentClassName = '',
    hideTopbar = false,
    children,
}: AppLayoutProps) {
    const navigate = useNavigate();

    return (
        <FoodmapShell hideBottomNav={hideNav} hideTopbar={hideTopbar} contentClassName="foodmap-page-shell">
            <div className={`foodmap-page-scroll ${contentClassName}`}>
                <header className="foodmap-page-heading">
                    <div className="foodmap-page-heading-copy">
                        {showBack && (
                            <button className="foodmap-icon-button" type="button" aria-label="Quay lại" onClick={() => navigate(backPath)}>
                                <ShellIcon name="chevron-left" />
                            </button>
                        )}
                        <div>
                            <span className="foodmap-label">NeonFoodmap · Audio city guide</span>
                            <h1>{title}</h1>
                        </div>
                    </div>
                    {headerAction && <div>{headerAction}</div>}
                </header>
                <div className="foodmap-page-content">{children}</div>
            </div>
        </FoodmapShell>
    );
}
