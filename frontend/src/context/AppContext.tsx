import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import type { User, POI, NarrationState, Partner, Media } from '../types';
import { getUserAuthSession } from '../services/api';

interface AppState {
    user: User | null;
    isOnline: boolean;
    offlineReady: boolean;
    narrationQueue: POI[];
    activeNarration: NarrationState | null;
    nearbyPOIs: POI[];
}

type AppAction =
    | { type: 'SET_USER'; payload: User }
    | { type: 'CLEAR_USER' }
    | { type: 'SET_ONLINE'; payload: boolean }
    | { type: 'SET_OFFLINE_READY'; payload: boolean }
    | { type: 'PUSH_TO_QUEUE'; payload: POI }
    | { type: 'REMOVE_FROM_QUEUE' }
    | { type: 'SET_ACTIVE_NARRATION'; payload: NarrationState | null }
    | { type: 'UPDATE_NARRATION_STATE'; payload: Partial<NarrationState> }
    | { type: 'SET_NEARBY_POIS'; payload: POI[] };

function reducer(state: AppState, action: AppAction): AppState {
    switch (action.type) {
        case 'SET_USER':
            return { ...state, user: action.payload };
        case 'CLEAR_USER':
            return { ...state, user: null };
        case 'SET_ONLINE':
            return { ...state, isOnline: action.payload };
        case 'SET_OFFLINE_READY':
            return { ...state, offlineReady: action.payload };
        case 'PUSH_TO_QUEUE':
            // Anti-duplicate: không thêm cùng 1 POI đang active vào queue
            if (state.activeNarration?.poi.id === action.payload.id) return state;
            if (state.narrationQueue.some(p => p.id === action.payload.id)) return state;
            return { ...state, narrationQueue: [...state.narrationQueue, action.payload] };
        case 'REMOVE_FROM_QUEUE':
            return { ...state, narrationQueue: state.narrationQueue.slice(1) };
        case 'SET_ACTIVE_NARRATION':
            return { ...state, activeNarration: action.payload };
        case 'UPDATE_NARRATION_STATE':
            if (!state.activeNarration) return state;
            return { ...state, activeNarration: { ...state.activeNarration, ...action.payload } };
        case 'SET_NEARBY_POIS':
            return { ...state, nearbyPOIs: action.payload };
        default:
            return state;
    }
}

interface AppContextValue extends AppState {
    dispatch: React.Dispatch<AppAction>;
    openNarration: (poi: POI, media?: Media | null, partners?: Partner[]) => void;
    closeNarration: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

// Helper to get initial user from session if available
const getInitialUser = (): User | null => {
    const session = getUserAuthSession();
    if (session?.user) return session.user;
    return null;
};

const initialState: AppState = {
    user: getInitialUser(),
    isOnline: navigator.onLine,
    offlineReady: localStorage.getItem('bcsd_offline_mode') === 'true',
    narrationQueue: [],
    activeNarration: null,
    nearbyPOIs: [],
};

export function AppProvider({ children }: { children: React.ReactNode }) {
    const [state, dispatch] = useReducer(reducer, initialState);

    // Listen for online/offline events
    useEffect(() => {
        const handleOnline = () => dispatch({ type: 'SET_ONLINE', payload: true });
        const handleOffline = () => dispatch({ type: 'SET_ONLINE', payload: false });
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const openNarration = useCallback((poi: POI, media?: Media | null, partners: Partner[] = []) => {
        dispatch({
            type: 'SET_ACTIVE_NARRATION',
            payload: {
                poi,
                media: media || undefined,
                partners,
                isPlaying: true,
                currentTime: 0,
                duration: 0,
                playbackRate: 1,
            }
        });
    }, []);

    const closeNarration = useCallback(() => {
        dispatch({ type: 'SET_ACTIVE_NARRATION', payload: null });
    }, []);

    return (
        <AppContext.Provider value={{ ...state, dispatch, openNarration, closeNarration }}>
            {children}
        </AppContext.Provider>
    );
}

export function useApp() {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useApp must be used within AppProvider');
    return ctx;
}
