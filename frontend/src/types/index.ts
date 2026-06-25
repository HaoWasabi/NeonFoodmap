// Types for Phố Ẩm Thực Vĩnh Khánh App

export type Language = 'vi' | 'en' | 'zh' | 'ja' | 'ko';
export type VoiceRegion = 'mien_nam' | 'mien_bac' | 'mien_trung' | 'usa' | 'uk';
export type TriggerType = 'AUTO' | 'QR';
export type POICategory = 'food' | 'historical' | 'cultural' | 'scenic';

export interface User {
    id: string | number;
    email?: string;
    username?: string;
    full_name?: string;
    device_id: string;
    preferred_language: Language;
    preferred_voice_region: VoiceRegion;
    created_at?: string;
}

export interface UserAuthTokens {
    access: string;
    refresh: string;
}

export interface UserAuthSession {
    user: User;
    access: string;
    refresh: string;
}

export interface POI {
    id: string;
    name: string;
    description: string;
    latitude: number;  // khớp với backend serializer
    longitude: number; // khớp với backend serializer
    geofence_radius: number; // meters
    category: POICategory;
    qr_code_data: string;
    status?: number;
    /** ISO 8601 từ backend */
    created_at?: string;
    updated_at?: string;
    distance?: number; // field inject từ near-me view (mét)
    image_url?: string;
    cover_image_url?: string;
    address?: string;
    translated_name?: string;
    translated_description?: string;
    media?: Media[];
}

export interface Media {
    id: string;
    language: Language;
    voice_region: VoiceRegion;
    file_url: string;
    tts_content?: string;             // Bản dịch từ admin (dùng cho TTS đa ngôn ngữ)
    media_type: 'AUDIO' | 'TTS';     // uppercase, khớp với backend TextChoices
    media_type_display?: string;
}

/** POST /partners/account/deactivate/ */
export interface PartnerDeactivateResponse {
    partner_deactivated: boolean;
    poi_deactivated: boolean;
    message: string;
    profile: Partner;
}

export interface Partner {
    id: string;
    business_name: string;
    address?: string;
    intro_text?: string;
    qr_url?: string;
    menu_details?: { must_try?: string[]; price_range?: string };
    opening_hours?: string;
    status?: number;
    /** Nhãn trạng thái từ backend (vd. Chờ phê duyệt) */
    status_display?: string;
    is_premium_unlocked?: boolean;
    premium_price?: number;
    created_at?: string;
    updated_at?: string;
    poi_created_at?: string | null;
    poi_updated_at?: string | null;
    poi?: number | string | null;
}

export interface PartnerPremiumPurchaseResponse {
    invoice_id: string;
    partner_premium_purchase_id: string;
    amount: number;
    partner_name: string;
}

export interface Tour {
    id: string;
    name: string;
    description?: string;
    translated_name?: Record<string, string>;
    translated_description?: Record<string, string>;
    status: 0 | 1;
    is_suggested: boolean;
    is_premium?: boolean;
    premium_price?: number;
    is_unlocked?: boolean;
    estimated_duration_min?: number;
    cover_image_url?: string;
    pois: TourPOI[];
}

export interface TourPOI {
    poi: POI;
    sequence_order: number;
}

export interface TourPOIGroup {
    tour_id: string;
    tour_name: string;
    description?: string;
    translated_name?: Record<string, string>;
    translated_description?: Record<string, string>;
    is_suggested: boolean;
    estimated_duration_min?: number | null;
    items: TourPOI[];
    payload_bytes?: number;
}

export interface TourReview {
    id: string;
    tour: string | number;
    user: string | number;
    user_email: string;
    username: string;
    rating: number; // 1-5
    comment: string;
    created_at: string;
}

export interface NarrationLog {
    id?: string;
    /** poi (BE dùng FK id số nguyên, gửi lên dưới dạng số) */
    poi: number | string;
    start_time: string; // ISO
    trigger_type: TriggerType;
    duration?: number; // seconds
}

/** Response từ POST /api/analytics/narration/start/ */
export interface NarrationStartResponse {
    should_play: boolean;
    log?: NarrationLog;
    reason?: string;
}

export interface BreadcrumbPoint {
    lat: number;
    /** Kinh độ — dùng 'long' để match field name của BE */
    long: number;
    timestamp: string;
}

export interface NarrationState {
    poi: POI;
    media?: Media;
    partners: Partner[];
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    playbackRate: number;
}

export interface PartnerAuthUser {
    id: string;
    email: string;
    username: string;
    full_name?: string;
    preferred_language?: Language;
    preferred_voice_region?: VoiceRegion;
}

export interface PartnerAuthTokens {
    access: string;
    refresh: string;
}

export interface PartnerAuthSession {
    user: PartnerAuthUser;
    access: string;
    refresh: string;
}

/** Đăng nhập Partner: email hoặc username + mật khẩu. */
export interface PartnerLoginPayload {
    identifier: string;
    password: string;
}

/** Đăng nhập tài khoản người dùng app (theo email). */
export interface UserLoginPayload {
    email: string;
    password: string;
}

/** Đăng ký tài khoản người dùng app (khách du lịch). */
export interface UserSignupPayload {
    email: string;
    username: string;
    password: string;
    password_confirm: string;
    first_name?: string;
    last_name?: string;
}

/** Kích hoạt cổng Partner: xác thực tài khoản app + tạo/cập nhật hồ sơ Partner. */
export interface PartnerSignupPayload {
    /** Email hoặc username (trùng tài khoản app). */
    identifier: string;
    password: string;
    password_confirm: string;
    business_name: string;
    address?: string;
}

export interface DeviceInfo {
    deviceId: string;
    userAgent: string;
    platform: string;
    vendor?: string;
    language: string;
    languages: string[];
    cookieEnabled: boolean;
    onLine: boolean;
    screenResolution: string;
    colorDepth: number;
    pixelDepth: number;
    timezone: string;
    connectionType?: string;
    effectiveType?: string;
    memory?: number;
    hardwareConcurrency?: number;
}
