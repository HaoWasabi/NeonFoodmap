import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getUserAuthSession, guestLogin, getOrCreateDeviceId } from '../services/api';

/**
 * Creates a guest session when browsing the app without an account.
 * Skips on auth screens so "Đăng xuất" can land on /login without immediately re-guesting.
 */
export default function AppSessionBootstrap() {
    const location = useLocation();
    const { dispatch } = useApp();

    useEffect(() => {
        const path = location.pathname;

        const skipGuest =
            path === '/login' ||
            path === '/partner/login' ||
            path === '/partner/signup' ||
            path === '/splash';

        if (skipGuest) return;

        const session = getUserAuthSession();
        if (session?.user) return;

        const run = async () => {
            try {
                const devId = getOrCreateDeviceId();
                const newSession = await guestLogin(devId);
                dispatch({ type: 'SET_USER', payload: newSession.user });
            } catch (error) {
                console.error('Auto guest login failed', error);
            }
        };

        void run();
    }, [location.pathname, dispatch]);

    return null;
}
