import axios from 'axios';
import type {
    User,
    POI,
    Media,
    Partner,
    PartnerDeactivateResponse,
    Tour,
    TourPOIGroup,
    TourReview,
    NarrationLog,
    NarrationStartResponse,
    BreadcrumbPoint,
    PartnerAuthSession,
    PartnerLoginPayload,
    PartnerSignupPayload,
    UserSignupPayload,
    UserLoginPayload,
    PartnerAuthUser,
    UserAuthSession,
    PartnerPremiumPurchaseResponse,
} from '../types';

export interface Invoice {
    id: string;
    reason: string;
    amount: number;
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
    transaction_code: string;
    paid_at: string | null;
    created_at: string;
    updated_at: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 3000000,
    headers: { 
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true', // Bypass ngrok warning page
    },
});

const PARTNER_AUTH_STORAGE_KEY = 'bcsd_partner_auth';
const USER_AUTH_STORAGE_KEY = 'bcsd_user_auth';

interface PartnerLoginResponse {
    access: string;
    refresh: string;
    user: PartnerAuthUser;
}

interface PartnerSignupResponse {
    message: string;
    access: string;
    refresh: string;
    user: PartnerAuthUser;
}

export const getPartnerAuthSession = (): PartnerAuthSession | null => {
    try {
        const raw = localStorage.getItem(PARTNER_AUTH_STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as PartnerAuthSession;
    } catch {
        return null;
    }
};

export const setPartnerAuthSession = (session: PartnerAuthSession | null): void => {
    if (!session) {
        localStorage.removeItem(PARTNER_AUTH_STORAGE_KEY);
        return;
    }
    localStorage.setItem(PARTNER_AUTH_STORAGE_KEY, JSON.stringify(session));
};

export const isPartnerAuthenticated = (): boolean => {
    const session = getPartnerAuthSession();
    return Boolean(session?.access);
};

export const getUserAuthSession = (): UserAuthSession | null => {
    try {
        const raw = localStorage.getItem(USER_AUTH_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        if (
            !parsed ||
            typeof parsed !== 'object' ||
            !('access' in parsed) ||
            !('refresh' in parsed) ||
            !('user' in parsed)
        ) {
            return null;
        }
        return parsed as UserAuthSession;
    } catch {
        return null;
    }
};

export const setUserAuthSession = (session: UserAuthSession | null): void => {
    if (!session) {
        localStorage.removeItem(USER_AUTH_STORAGE_KEY);
        return;
    }
    localStorage.setItem(USER_AUTH_STORAGE_KEY, JSON.stringify(session));
};

export const isUserAuthenticated = (): boolean => {
    const session = getUserAuthSession();
    return Boolean(session?.access);
};

/** Stable anonymous device id for guest login (localStorage). */
export const getOrCreateDeviceId = (): string => {
    let devId = localStorage.getItem('bcsd_device_id');
    if (!devId) {
        devId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
        localStorage.setItem('bcsd_device_id', devId);
    }
    return devId;
};

let partnerRefreshPromise: Promise<string> | null = null;
let userRefreshPromise: Promise<string> | null = null;

// Offline mode interceptor - kiểm tra flag từ localStorage
// Cơ chế Switch Logic: khi offline, request ghi (POST/PUT) vào SyncQueue,
// request đọc (GET) trả về lỗi đặc biệt để caller dùng dữ liệu local
apiClient.interceptors.request.use((config) => {
    console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, config.headers);
    const isOffline = localStorage.getItem('bcsd_offline_mode') === 'true' && !navigator.onLine;
    if (isOffline) {
        console.warn(`[API Blocked] App is in offline mode or navigator.onLine is false. Blocked: ${config.url}`);
        // Ghi requests (POST, PUT): queue vào SyncQueue thay vì gửi thẳng
        if (config.method === 'post' || config.method === 'put') {
            const syncQueue = JSON.parse(localStorage.getItem('bcsd_sync_queue') || '[]');
            syncQueue.push({
                type: config.url?.includes('/narration/start') ? 'narration_start'
                    : config.url?.includes('/narration') && config.url?.includes('/end') ? 'narration_end'
                        : config.url?.includes('/breadcrumbs') ? 'breadcrumb'
                            : 'unknown',
                payload: config.data ? (typeof config.data === 'string' ? JSON.parse(config.data) : config.data) : {},
                created_at: new Date().toISOString(),
            });
            localStorage.setItem('bcsd_sync_queue', JSON.stringify(syncQueue.slice(-500)));
        }
        // Tất cả offline requests đều throw error để caller sử dụng mock/local data
        const error = new Error('OFFLINE_MODE') as Error & { isOfflineMode: boolean };
        error.isOfflineMode = true;
        throw error;
    }

    // Auth Header Logic
    const url = config.url || '';
    const isPartnerRoute = 
        url.includes('/partners/') || 
        url.includes('/pois/my-poi') || 
        (url.includes('/media') && config.method?.toLowerCase() !== 'get');
        
    if (isPartnerRoute) {
        const session = getPartnerAuthSession();
        if (session?.access) {
            config.headers.Authorization = `Bearer ${session.access}`;
        }
    } else {
        const session = getUserAuthSession();
        if (session?.access) {
            config.headers.Authorization = `Bearer ${session.access}`;
        }
    }

    // Set Accept-Language header so backend (Django) can return translated content
    const lang = localStorage.getItem('bcsd_language') || 'vi';
    config.headers['Accept-Language'] = lang;

    return config;
});

// --- Token refresh logic (JWT) ---
// Handles both Partner and User sessions
apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (!axios.isAxiosError(error) || error.response?.status !== 401) {
            return Promise.reject(error);
        }

        const originalRequest = error.config as (any & { _retry?: boolean }) | undefined;
        if (!originalRequest || originalRequest._retry) {
            return Promise.reject(error);
        }

        const url = originalRequest.url || '';
        const isPartnerRoute = 
            url.includes('/partners/') || 
            url.includes('/pois/my-poi') || 
            (url.includes('/media') && originalRequest.method?.toLowerCase() !== 'get');

        // Avoid refresh loop for login/refresh/logout/guest endpoints
        const isAuthRoute =
            url.includes('/login/') ||
            url.includes('/refresh/') ||
            url.includes('/logout/') ||
            url.includes('/guest-login/') ||
            url.includes('/upgrade-guest/');

        if (isAuthRoute) {
            return Promise.reject(error);
        }

        if (isPartnerRoute) {
            // --- PARTNER REFRESH ---
            const session = getPartnerAuthSession();
            if (!session?.refresh) {
                setPartnerAuthSession(null);
                return Promise.reject(error);
            }

            try {
                if (!partnerRefreshPromise) {
                    partnerRefreshPromise = (async () => {
                        const refreshResp = await axios.post(
                            `${API_BASE_URL}/partners/account/login/refresh/`,
                            { refresh: session.refresh },
                            { 
                                headers: { 
                                    'Content-Type': 'application/json',
                                    'ngrok-skip-browser-warning': 'true' 
                                }, 
                                timeout: 10000 
                            }
                        );
                        const newAccess = (refreshResp.data as any)?.access;
                        if (!newAccess) throw new Error('Refresh failed');
                        
                        const nextSession: PartnerAuthSession = { ...session, access: newAccess };
                        setPartnerAuthSession(nextSession);
                        return newAccess;
                    })().finally(() => { partnerRefreshPromise = null; });
                }

                const newAccess = await partnerRefreshPromise;
                originalRequest._retry = true;
                originalRequest.headers.Authorization = `Bearer ${newAccess}`;
                return apiClient(originalRequest);
            } catch {
                setPartnerAuthSession(null);
                return Promise.reject(error);
            }
        } else {
            // --- USER/GUEST REFRESH ---
            const session = getUserAuthSession();
            if (!session?.refresh) {
                setUserAuthSession(null);
                return Promise.reject(error);
            }

            try {
                if (!userRefreshPromise) {
                    userRefreshPromise = (async () => {
                        const refreshResp = await axios.post(
                            `${API_BASE_URL}/users/login/refresh/`,
                            { refresh: session.refresh },
                            { 
                                headers: { 
                                    'Content-Type': 'application/json',
                                    'ngrok-skip-browser-warning': 'true' 
                                }, 
                                timeout: 30000
                            }
                        );
                        const newAccess = (refreshResp.data as any)?.access;
                        if (!newAccess) throw new Error('Refresh failed');
                        
                        const nextSession: UserAuthSession = { ...session, access: newAccess };
                        setUserAuthSession(nextSession);
                        return newAccess;
                    })().finally(() => { userRefreshPromise = null; });
                }

                const newAccess = await userRefreshPromise;
                originalRequest._retry = true;
                originalRequest.headers.Authorization = `Bearer ${newAccess}`;
                return apiClient(originalRequest);
            } catch {
                setUserAuthSession(null);
                return Promise.reject(error);
            }
        }
    }
);

// --- User endpoints ---
export const initUser = async (deviceId: string): Promise<User> => {
    const { data } = await apiClient.post<User>('/users/init/', { device_id: deviceId });
    return data;
};

export const guestLogin = async (deviceId: string): Promise<UserAuthSession> => {
    const { data } = await apiClient.post<UserAuthSession>('/users/guest-login/', { device_id: deviceId });
    setUserAuthSession(data);
    return data;
};

export const upgradeGuestAccount = async (payload: { email: string; password: string; password_confirm: string }): Promise<UserAuthSession> => {
    const { data } = await apiClient.post<UserAuthSession>('/users/upgrade-guest/', {
        ...payload,
        device_id: getOrCreateDeviceId(),
    });
    setUserAuthSession(data);
    return data;
};

export const loginPartner = async (payload: PartnerLoginPayload): Promise<PartnerAuthSession> => {
    const { data } = await apiClient.post<PartnerLoginResponse>('/partners/account/login/', payload);
    const session: PartnerAuthSession = {
        user: data.user,
        access: data.access,
        refresh: data.refresh,
    };
    setPartnerAuthSession(session);
    return session;
};

export const loginUserAccount = async (payload: UserLoginPayload): Promise<UserAuthSession> => {
    const { data } = await apiClient.post<UserAuthSession>('/users/login/', payload);
    setUserAuthSession(data);
    return data;
};

export const signupPartner = async (payload: PartnerSignupPayload): Promise<PartnerAuthSession> => {
    const { data } = await apiClient.post<PartnerSignupResponse>('/partners/account/register/', payload);
    const session: PartnerAuthSession = {
        user: data.user,
        access: data.access,
        refresh: data.refresh,
    };
    setPartnerAuthSession(session);
    return session;
};

/** POST /api/users/register/ — trả `tokens: { access, refresh }`, không phải access ở root. */
export const signupUserAccount = async (payload: UserSignupPayload): Promise<UserAuthSession> => {
    const { data } = await apiClient.post<{
        message: string;
        tokens: { access: string; refresh: string };
        user: {
            id: number;
            email: string;
            username: string;
            full_name?: string;
        };
    }>('/users/register/', payload);
    const session: UserAuthSession = {
        user: {
            id: data.user.id,
            email: data.user.email,
            username: data.user.username,
            full_name: data.user.full_name || '',
            device_id: getOrCreateDeviceId(),
            preferred_language: 'vi',
            preferred_voice_region: 'mien_nam',
        },
        access: data.tokens.access,
        refresh: data.tokens.refresh,
    };
    setUserAuthSession(session);
    return session;
};

export const logoutPartner = async (): Promise<void> => {
    const session = getPartnerAuthSession();
    try {
        if (session?.refresh) {
            await apiClient.post('/partners/account/logout/', { refresh: session.refresh });
        }
    } finally {
        setPartnerAuthSession(null);
    }
};

// --- Partner business profile endpoints ---
export const getPartnerAccountProfile = async (): Promise<Partner> => {
    const { data } = await apiClient.get<Partner>('/partners/account/profile/');
    return data;
};

export const upsertPartnerAccountProfile = async (payload: Partial<Partner>): Promise<Partner> => {
    const { data } = await apiClient.put<Partner>('/partners/account/profile/', payload);
    return data;
};

export interface PartnerAnalyticsData {
    impressions: number;
    interactions: number;
    qr_scans: number;
    avg_listen_sec: number;
    ctr: number;
    wow_impressions: number | null;
    wow_interactions: number | null;
    has_poi: boolean;
}

export const getPartnerAnalytics = async (): Promise<PartnerAnalyticsData> => {
    const { data } = await apiClient.get<PartnerAnalyticsData>('/partners/account/analytics/');
    return data;
};

/** Tắt hồ sơ Partner (và POI nếu bạn là chủ sở hữu POI). */
export const deactivatePartnerAccount = async (): Promise<PartnerDeactivateResponse> => {
    const { data } = await apiClient.post<PartnerDeactivateResponse>('/partners/account/deactivate/', {});
    return data;
};

/** Chuẩn hoá `detail` từ DRF (string | string[] | object field errors). */
const normalizeDrfDetail = (detail: unknown): string | null => {
    if (detail == null) return null;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
        const parts = detail.map((x) => (typeof x === 'string' ? x : String(x)));
        const joined = parts.filter(Boolean).join(' ');
        return joined || null;
    }
    if (typeof detail === 'object') {
        const messages: string[] = [];
        for (const v of Object.values(detail as Record<string, unknown>)) {
            if (typeof v === 'string') messages.push(v);
            else if (Array.isArray(v)) {
                for (const item of v) {
                    if (typeof item === 'string') messages.push(item);
                }
            }
        }
        if (messages.length) return messages.join(' ');
    }
    return null;
};

export const getApiErrorMessage = (error: unknown, fallback = 'Có lỗi xảy ra, vui lòng thử lại.'): string => {
    if (!axios.isAxiosError(error)) return fallback;

    const status = error.response?.status;
    const responseData = error.response?.data;
    if (typeof responseData === 'string') return responseData;

    if (responseData && typeof responseData === 'object') {
        if ('detail' in responseData) {
            const msg = normalizeDrfDetail((responseData as { detail: unknown }).detail);
            if (msg) return msg;
        }
        if ('error' in responseData && typeof responseData.error === 'string') return responseData.error;
        if ('message' in responseData && typeof responseData.message === 'string') return responseData.message;

        const firstField = Object.values(responseData)[0];
        if (Array.isArray(firstField) && typeof firstField[0] === 'string') return firstField[0];
        if (typeof firstField === 'string') return firstField;
    }

    if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
    if (status === 404) return 'Không tìm thấy dữ liệu.';
    return fallback;
};

// --- Payment / Invoice endpoints ---
export const createInvoice = async (amount: number): Promise<Invoice> => {
    const { data } = await apiClient.post<Invoice>('/payments/invoices/', { amount });
    return data;
};

export const getInvoiceById = async (invoiceId: string): Promise<Invoice> => {
    const { data } = await apiClient.get<Invoice>(`/payments/invoices/${invoiceId}/`);
    return data;
};

export const getInvoices = async (): Promise<Invoice[]> => {
    const { data } = await apiClient.get<Invoice[]>('/payments/invoices/');
    return data;
};

export const paypalCreateOrder = async (invoiceId: string): Promise<string> => {
    const { data } = await apiClient.post<{ id: string }>(
        '/payments/paypal/create-order/',
        { invoiceId }
    );
    return data.id;
};

export const paypalCaptureOrder = async (orderId: string, invoiceId?: string): Promise<unknown> => {
    const { data } = await apiClient.post(
        `/payments/paypal/capture-order/${orderId}/`,
        invoiceId ? { invoiceId } : {}
    );
    return data;
};

// --- Premium Tour Purchase ---

export interface TourPurchaseResponse {
    invoice_id: string;
    tour_purchase_id: string;
    amount: number;
    tour_name: string;
}

export const purchasePremiumTour = async (tourId: string | number): Promise<TourPurchaseResponse> => {
    const { data } = await apiClient.post<TourPurchaseResponse>(
        '/payments/tour-purchase/',
        { tour_id: tourId }
    );
    return data;
};

export const checkTourPurchase = async (tourId: string | number): Promise<{ purchased: boolean }> => {
    const { data } = await apiClient.get<{ purchased: boolean }>(
        '/payments/tour-purchase/check/',
        { params: { tour_id: tourId } }
    );
    return data;
};

export const purchasePartnerPremium = async (): Promise<PartnerPremiumPurchaseResponse> => {
    const { data } = await apiClient.post<PartnerPremiumPurchaseResponse>(
        '/payments/partner-premium/',
        {}
    );
    return data;
};

export const checkPartnerPremiumPurchase = async (): Promise<{ purchased: boolean }> => {
    const { data } = await apiClient.get<{ purchased: boolean }>('/payments/partner-premium/check/');
    return data;
};

// --- POI endpoints ---
export const getPOIsNearMe = async (lat: number, lng: number, language = 'vi', voiceRegion = 'mien_nam', radius = 500): Promise<POI[]> => {
    const { data } = await apiClient.get<POI[]>('/pois/near-me/', { params: { lat, lng, radius, language, voice_region: voiceRegion } });
    return data;
};

export const getPOIById = async (id: string): Promise<POI> => {
    const { data } = await apiClient.get<POI>(`/pois/${id}/`);
    return data;
};

export const scanQRCode = async (code: string): Promise<POI> => {
    const { data } = await apiClient.get<POI>('/pois/scan/', { params: { code } });
    return data;
};

export interface PartnerMapQrUrlResponse {
    map_path: string;
    expires_in_seconds: number;
    expires_at: string;
}

/** Signed /map?poi=&qr= URL for printed venue QR (valid 1 hour). Requires partner auth. */
export const getPartnerMapQrUrl = async (): Promise<PartnerMapQrUrlResponse> => {
    const { data } = await apiClient.get<PartnerMapQrUrlResponse>('/pois/my-poi/qr-map-url/');
    return data;
};

/** Resolve POI from signed map QR token (same response shape as getPOIById). */
export const resolveMapQrPoi = async (poiId: string, qrToken: string): Promise<POI> => {
    const { data } = await apiClient.get<POI>('/pois/map-qr/resolve/', {
        params: { poi: poiId, qr: qrToken },
    });
    return data;
};

export const uploadPOICoverImage = async (file: File): Promise<{ cover_image_url: string }> => {
    const formData = new FormData();
    formData.append('image', file);
    const { data } = await apiClient.post<{ cover_image_url: string }>(
        '/pois/my-poi/cover-image/',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data;
};

export const selectBestMedia = (mediaList: Media[], language: string, voiceRegion: string): Media | null => {
    if (!Array.isArray(mediaList)) return null;
    // Media Selection Engine: exact match > language-only match > null (TTS fallback)
    const exactMatch = mediaList.find(m => m.language === language && m.voice_region === voiceRegion);
    if (exactMatch) return exactMatch;
    const languageMatch = mediaList.find(m => m.language === language);
    return languageMatch || null;
};

export const getPOIMedia = async (poiId: string, language: string, voiceRegion: string): Promise<Media | null> => {
    try {
        const { data } = await apiClient.get<Media[]>(`/pois/${poiId}/media/`, { params: { language, voice_region: voiceRegion } });
        return selectBestMedia(data, language, voiceRegion);
    } catch {
        return null;
    }
};

export const getPOIPartners = async (poiId: string): Promise<Partner[]> => {
    try {
        const { data } = await apiClient.get(`/pois/${poiId}/partners/`);
        // Handle DRF pagination: { count, results: [...] } hoặc plain array
        if (Array.isArray(data)) return data as Partner[];
        if (data && Array.isArray((data as { results?: unknown }).results)) {
            return (data as { results: Partner[] }).results;
        }
        return [];
    } catch {
        return [];
    }
};

// --- Tour endpoints ---
export const getTours = async (): Promise<Tour[]> => {
    try {
        const { data } = await apiClient.get('/tours/');
        // DRF pagination support: { count, next, previous, results: [...] }
        if (Array.isArray(data)) return data as Tour[];
        if (data && Array.isArray((data as { results?: unknown }).results)) {
            return (data as { results: Tour[] }).results;
        }
        return [];
    } catch (error) {
        // Nếu token trong localStorage không hợp lệ (vd demo token), fallback gọi public không Authorization.
        if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
            const { data } = await axios.get(`${API_BASE_URL}/tours/`, {
                timeout: 10000,
                headers: { 'Content-Type': 'application/json' },
            });
            if (Array.isArray(data)) return data as Tour[];
            if (data && Array.isArray((data as { results?: unknown }).results)) {
                return (data as { results: Tour[] }).results;
            }
            return [];
        }
        throw error;
    }
};

export const getTourById = async (id: string): Promise<Tour> => {
    try {
        const { data } = await apiClient.get<Tour>(`/tours/${id}/`);
        return data;
    } catch (error) {
        // Nếu token local không hợp lệ (vd demo token), gọi lại endpoint public không Authorization.
        if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
            const { data } = await axios.get<Tour>(`${API_BASE_URL}/tours/${id}/`, {
                timeout: 10000,
                headers: { 'Content-Type': 'application/json' },
            });
            return data;
        }
        throw error;
    }
};

export const getTourPOIGroups = async (tourIds?: string[]): Promise<TourPOIGroup[]> => {
    const params: Record<string, string> = {};
    if (tourIds && tourIds.length > 0) {
        params.tour_ids = tourIds.join(',');
    }

    try {
        const { data } = await apiClient.get<TourPOIGroup[]>('/tours/tour-pois/', { params });
        return data;
    } catch (error) {
        // Nếu token local không hợp lệ (vd demo token), gọi lại endpoint public không Authorization.
        if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
            const { data } = await axios.get<TourPOIGroup[]>(`${API_BASE_URL}/tours/tour-pois/`, {
                params,
                timeout: 10000,
                headers: { 'Content-Type': 'application/json' },
            });
            return data;
        }
        throw error;
    }
};

export const getTourReviews = async (tourId: string): Promise<TourReview[]> => {
    const { data } = await apiClient.get<TourReview[]>(`/tours/reviews/`, {
        params: { tour_id: tourId }
    });
    return data;
};

export const submitTourReview = async (review: Omit<TourReview, 'id' | 'created_at' | 'user_email' | 'username'>): Promise<TourReview> => {
    const { data } = await apiClient.post<TourReview>(`/tours/reviews/`, review);
    return data;
};

// --- Analytics / Log endpoints ---

/**
 * Gửi batch lên POST /api/analytics/narration/start/
 * Response: { should_play, log?, reason? }
 * - should_play = false → anti-spam blocked (trigger AUTO đã nghe trong 30 phút)
 * - should_play = true  → tạo record thành công, trả về log
 */
export const startNarration = async (
    payload: Pick<NarrationLog, 'poi' | 'trigger_type' | 'start_time'>
): Promise<NarrationStartResponse> => {
    const { data } = await apiClient.post<NarrationStartResponse>(
        '/analytics/narration/start/',
        payload
    );
    return data;
};

/**
 * PATCH /api/analytics/narration/<id>/end/
 * Cập nhật số giây thực tế người dùng đã nghe.
 */
export const endNarration = async (logId: string | number, duration: number): Promise<void> => {
    await apiClient.patch(`/analytics/narration/${logId}/end/`, { duration });
};

/**
 * POST /api/analytics/breadcrumbs/batch/
 * Payload: { points: [{lat, long, timestamp}] }
 * user được BE lấy từ JWT token, không cần gửi user_id.
 */
export const postBreadcrumbs = async (points: BreadcrumbPoint[]): Promise<void> => {
    await apiClient.post('/analytics/breadcrumbs/batch/', { points });
};

// --- Offline data endpoint ---
export const downloadOfflinePackage = async (tourId: string): Promise<Blob> => {
    const { data } = await apiClient.get<Blob>(`/offline/package/${tourId}/`, { responseType: 'blob' });
    return data;
};

export default apiClient;
