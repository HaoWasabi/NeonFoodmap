import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNavBar from './BottomNavBar';

interface AppLayoutProps {
    /** Page title shown in header */
    title: string;
    /** Show back arrow button */
    showBack?: boolean;
    /** Custom back path (default: /map) */
    backPath?: string;
    /** Optional right-side action in header */
    headerAction?: ReactNode;
    /** Hide bottom nav (e.g. for full-screen modals) */
    hideNav?: boolean;
    /** Extra classNames for content area */
    contentClassName?: string;
    children: ReactNode;
}

export default function AppLayout({
    title,
    showBack = true,
    backPath = '/map',
    headerAction,
    hideNav = false,
    contentClassName = '',
    children,
}: AppLayoutProps) {
    const navigate = useNavigate();

    return (
        <div className="relative flex h-dvh w-full flex-col bg-background-light overflow-hidden">
            {/* ─── HEADER ─── */}
            <header className="flex items-center bg-white/90 backdrop-blur-xl sticky top-0 z-20 border-b border-slate-100/80 animate-fade-slide-down">
                <div className="mx-auto w-full max-w-2xl lg:max-w-4xl px-4 py-3 flex items-center justify-between">
                    <div className="w-12 flex justify-start">
                        {showBack && (
                            <button
                                onClick={() => navigate(backPath)}
                                className="flex size-10 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 tap-scale transition-colors"
                            >
                                <span className="material-symbols-outlined text-xl">arrow_back</span>
                            </button>
                        )}
                    </div>
                    <h1 className="text-slate-900 text-lg font-bold leading-tight tracking-tight flex-1 text-center">
                        {title}
                    </h1>
                    <div className="w-12 flex justify-end">
                        {headerAction || <div className="w-10" />}
                    </div>
                </div>
            </header>

            {/* ─── SCROLLABLE CONTENT ─── */}
            <main className={`flex-1 overflow-y-auto ${hideNav ? 'pb-6' : 'pb-24'} ${contentClassName}`}>
                <div className="mx-auto w-full max-w-2xl lg:max-w-4xl px-4 animate-fade-slide-up">
                    {children}
                </div>
            </main>

            {/* ─── BOTTOM NAV ─── */}
            {!hideNav && (
                <div className="fixed bottom-0 left-0 right-0 z-20">
                    <BottomNavBar />
                </div>
            )}
        </div>
    );
}
