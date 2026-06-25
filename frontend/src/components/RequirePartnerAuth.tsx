import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isPartnerAuthenticated } from '../services/api';

interface RequirePartnerAuthProps {
    children: ReactNode;
}

export default function RequirePartnerAuth({ children }: RequirePartnerAuthProps) {
    const location = useLocation();

    if (!isPartnerAuthenticated()) {
        const nextPath = `${location.pathname}${location.search}`;
        return <Navigate to={`/partner/login?next=${encodeURIComponent(nextPath)}`} replace />;
    }

    return <>{children}</>;
}
