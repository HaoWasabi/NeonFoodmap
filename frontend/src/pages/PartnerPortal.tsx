import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import PartnerPremiumCheckout from '../components/PartnerPremiumCheckout';
import {
  deactivatePartnerAccount,
  getApiErrorMessage,
  getPartnerAccountProfile,
  getPartnerAnalytics,
  isPartnerAuthenticated,
  logoutPartner,
  upsertPartnerAccountProfile,
  type PartnerAnalyticsData,
} from '../services/api';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import PartnerPOI from '../components/PartnerPOI';

type ApprovalStatus = 'pending' | 'approved' | 'needs_fix';
type PartnerTab = 'profile' | 'poi' | 'distribution' | 'analytics';

interface PartnerDraft {
  businessName: string;
  address: string;
  introText: string;
  openingHours: string;
  mustTry: string;
  menuPriceRange: string;
}



const DEFAULT_DRAFT: PartnerDraft = {
  businessName: '',
  address: '',
  introText: '',
  openingHours: '',
  mustTry: '',
  menuPriceRange: '',
};

const QR_SCAN_PATH = '/api/pois/scan/';

function formatVnDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });
}

function adminStyleStatusLabel(status: number | undefined, statusDisplay: string): string {
  if (statusDisplay.trim()) return statusDisplay;
  if (status === 1) return 'Hoạt động';
  if (status === 2) return 'Chờ phê duyệt';
  if (status === 0) return 'Bị từ chối';
  return '—';
}

interface DistributionInfo {
  partnerStatus: number | null;
  partnerCreatedAt: string | null;
  partnerUpdatedAt: string | null;
  poiCreatedAt: string | null;
  poiUpdatedAt: string | null;
  statusDisplay: string;
  premiumUnlocked: boolean;
  premiumPrice: number;
}

function getPublicBaseUrl(): string {
  const envBase = (import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined)?.trim();
  return (envBase && envBase.length > 0 ? envBase : window.location.origin).replace(/\/+$/, '');
}

function buildScanQrUrl(baseUrl: string, code: string): string {
  const url = new URL(QR_SCAN_PATH, `${baseUrl}/`);
  url.searchParams.set('code', code);
  return url.toString();
}

function normalizeTimeValue(raw: string): string {
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function parseOpeningHours(raw: string): { openAt: string; closeAt: string } {
  const m = raw.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (!m) return { openAt: '', closeAt: '' };
  return {
    openAt: normalizeTimeValue(m[1]),
    closeAt: normalizeTimeValue(m[2]),
  };
}

function buildOpeningHours(openAt: string, closeAt: string): string {
  if (!openAt || !closeAt) return '';
  return `${openAt} - ${closeAt}`;
}

const PARTNER_TABS: { id: PartnerTab; label: string; icon: string }[] = [
  { id: 'profile', label: 'Hồ sơ', icon: 'badge' },
  { id: 'poi', label: 'POI', icon: 'location_on' },
  { id: 'distribution', label: 'Tổng quan', icon: 'dashboard' },
  { id: 'analytics', label: 'Hiệu quả', icon: 'monitoring' },
];

export default function PartnerPortal() {
  const navigate = useNavigate();
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>('pending');
  const [activeTab, setActiveTab] = useState<PartnerTab>('profile');
  const [draft, setDraft] = useState<PartnerDraft>(DEFAULT_DRAFT);
  const [savedAt, setSavedAt] = useState<string>('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [partnerPoiId, setPartnerPoiId] = useState('');
  const [distributionInfo, setDistributionInfo] = useState<DistributionInfo>({
    partnerStatus: null,
    partnerCreatedAt: null,
    partnerUpdatedAt: null,
    poiCreatedAt: null,
    poiUpdatedAt: null,
    statusDisplay: '',
    premiumUnlocked: false,
    premiumPrice: 0,
  });
  const [deactivating, setDeactivating] = useState(false);
  const [showPremiumCheckout, setShowPremiumCheckout] = useState(false);
  const { isPlaying, speakTTS, pause, load, play } = useAudioPlayer();
  const [introLoading, setIntroLoading] = useState(false);
  const publicBaseUrl = useMemo(() => getPublicBaseUrl(), []);
  const [analyticsData, setAnalyticsData] = useState<PartnerAnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const effectiveQrUrl = useMemo(() => {
    if (!partnerPoiId) return '';
    return buildScanQrUrl(publicBaseUrl, partnerPoiId);
  }, [partnerPoiId, publicBaseUrl]);

  const handlePremiumSuccess = () => {
    setShowPremiumCheckout(false);
    window.location.reload();
  };


  const handleFieldChange = (key: keyof PartnerDraft, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const openingTime = useMemo(() => parseOpeningHours(draft.openingHours), [draft.openingHours]);

  const handleOpeningTimeChange = (key: 'openAt' | 'closeAt', value: string) => {
    const next = { ...openingTime, [key]: value };
    handleFieldChange('openingHours', buildOpeningHours(next.openAt, next.closeAt));
  };

  const handleSaveDraft = () => {
    // gọi API CRUD profile (đồng thời "upsert" nếu chưa có partner profile)
    const mustTryList = draft.mustTry
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      business_name: draft.businessName,
      address: draft.address,
      intro_text: draft.introText,
      opening_hours: draft.openingHours,
      qr_url: effectiveQrUrl,
      menu_details: {
        must_try: mustTryList,
        price_range: draft.menuPriceRange,
      },
    };

    void (async () => {
      setSavingProfile(true);
      setProfileError('');
      try {
        const data = await upsertPartnerAccountProfile(payload);
        setSavedAt(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
        setDistributionInfo({
          partnerStatus: typeof data.status === 'number' ? data.status : null,
          partnerCreatedAt: data.created_at ?? null,
          partnerUpdatedAt: data.updated_at ?? null,
          poiCreatedAt: data.poi_created_at ?? null,
          poiUpdatedAt: data.poi_updated_at ?? null,
          statusDisplay: data.status_display?.trim() ?? '',
          premiumUnlocked: Boolean(data.is_premium_unlocked),
          premiumPrice: Number(data.premium_price ?? 0),
        });
        if (typeof data.status === 'number') {
          const nextApprovalStatus: ApprovalStatus =
            data.status === 1 ? 'approved' : data.status === 2 ? 'pending' : 'needs_fix';
          setApprovalStatus(nextApprovalStatus);
        }
      } catch (err) {
        // giữ UX cũ: hiển thị message dưới form
        // (không import thêm util để tránh lệch style)
        const msg = err instanceof Error ? err.message : 'Không thể lưu hồ sơ. Vui lòng thử lại.';
        setProfileError(msg);
      } finally {
        setSavingProfile(false);
      }
    })();
  };

  const handlePartnerLogout = async () => {
    setLoggingOut(true);
    try {
      await logoutPartner();
    } finally {
      navigate('/partner/login?next=%2Fpartner', { replace: true });
      setLoggingOut(false);
    }
  };

  const handleDeactivateDisplay = async () => {
    const lines = [
      'Bạn sắp tắt hiển thị hồ sơ đối tác (trạng thái không hoạt động).',
      '',
      'Nếu tài khoản của bạn là chủ sở hữu POI, điểm đó cũng sẽ được tắt.',
      'Nếu POI dùng chung với đối tác khác, POI có thể giữ nguyên.',
      '',
      'Tiếp tục?',
    ];
    if (!window.confirm(lines.join('\n'))) return;
    setDeactivating(true);
    try {
      const res = await deactivatePartnerAccount();
      const p = res.profile;
      setDistributionInfo({
        partnerStatus: typeof p.status === 'number' ? p.status : null,
        partnerCreatedAt: p.created_at ?? null,
        partnerUpdatedAt: p.updated_at ?? null,
        poiCreatedAt: p.poi_created_at ?? null,
        poiUpdatedAt: p.poi_updated_at ?? null,
        statusDisplay: p.status_display?.trim() ?? '',
        premiumUnlocked: Boolean(p.is_premium_unlocked),
        premiumPrice: Number(p.premium_price ?? 0),
      });
      setPartnerPoiId(p.poi ? String(p.poi) : '');
      if (typeof p.status === 'number') {
        setApprovalStatus(p.status === 1 ? 'approved' : p.status === 2 ? 'pending' : 'needs_fix');
      }
      alert(res.message);
    } catch (err) {
      alert(getApiErrorMessage(err, 'Không thể tắt hiển thị. Vui lòng thử lại.'));
    } finally {
      setDeactivating(false);
    }
  };

  const handleTestIntro = async () => {
    if (isPlaying) {
      pause();
      return;
    }
    if (!draft.introText) return;

    // Nếu có POI liên kết → thử lấy audio thật từ BE
    if (partnerPoiId) {
      setIntroLoading(true);
      try {
        const { getPOIMedia } = await import('../services/api');
        const media = await getPOIMedia(partnerPoiId, 'vi', 'mien_nam');
        if (media?.file_url) {
          await load(media.file_url);
          await play();
          return;
        }
      } catch {
        // không có media → fallback TTS
      } finally {
        setIntroLoading(false);
      }
    }

    // Fallback: browser TTS
    speakTTS(draft.introText, 'vi-VN');
  };



  const statusClassName =
    approvalStatus === 'approved'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : approvalStatus === 'needs_fix'
        ? 'bg-rose-50 text-rose-700 border-rose-200'
      : 'bg-amber-50 text-amber-700 border-amber-200';

  const statusLabel = approvalStatus === 'approved'
    ? 'Đã duyệt'
    : approvalStatus === 'needs_fix'
      ? 'Cần chỉnh sửa'
      : 'Chờ duyệt';

  useEffect(() => {
    let cancelled = false;
    setLoadingProfile(true);
    setProfileError('');

    void (async () => {
      try {
        if (!isPartnerAuthenticated()) {
          navigate('/partner/login?next=%2Fpartner', { replace: true });
          return;
        }

        const data = await getPartnerAccountProfile();
        if (cancelled) return;

        const mustTryArr = data.menu_details?.must_try ?? [];
        const priceRange = data.menu_details?.price_range ?? '';
        const status = data.status;

        const nextApprovalStatus: ApprovalStatus =
          status === 1 ? 'approved' : status === 2 ? 'pending' : 'needs_fix';

        setApprovalStatus(nextApprovalStatus);
        setPartnerPoiId(data.poi ? String(data.poi) : '');
        setDistributionInfo({
          partnerStatus: typeof data.status === 'number' ? data.status : null,
          partnerCreatedAt: data.created_at ?? null,
          partnerUpdatedAt: data.updated_at ?? null,
          poiCreatedAt: data.poi_created_at ?? null,
          poiUpdatedAt: data.poi_updated_at ?? null,
          statusDisplay: data.status_display?.trim() ?? '',
          premiumUnlocked: Boolean(data.is_premium_unlocked),
          premiumPrice: Number(data.premium_price ?? 0),
        });
        setDraft((prev) => ({
          ...prev,
          businessName: data.business_name || '',
          address: data.address || '',
          introText: data.intro_text || '',
          openingHours: data.opening_hours || '',
          mustTry: mustTryArr.join(', '),
          menuPriceRange: priceRange,
        }));
      } catch (err) {
        if (!isPartnerAuthenticated()) {
          navigate('/partner/login?next=%2Fpartner', { replace: true });
          return;
        }

        // Nếu chưa có partner profile, để user chỉnh form rồi lưu (endpoint PUT sẽ upsert).
        setProfileError(getApiErrorMessage(err, 'Không thể tải hồ sơ đối tác. Vui lòng thử lại.'));
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (activeTab !== 'distribution') return;
    if (!isPartnerAuthenticated()) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await getPartnerAccountProfile();
        if (cancelled) return;
        setPartnerPoiId(data.poi ? String(data.poi) : '');
        setDistributionInfo({
          partnerStatus: typeof data.status === 'number' ? data.status : null,
          partnerCreatedAt: data.created_at ?? null,
          partnerUpdatedAt: data.updated_at ?? null,
          poiCreatedAt: data.poi_created_at ?? null,
          poiUpdatedAt: data.poi_updated_at ?? null,
          statusDisplay: data.status_display?.trim() ?? '',
          premiumUnlocked: Boolean(data.is_premium_unlocked),
          premiumPrice: Number(data.premium_price ?? 0),
        });
        if (typeof data.status === 'number') {
          const nextApprovalStatus: ApprovalStatus =
            data.status === 1 ? 'approved' : data.status === 2 ? 'pending' : 'needs_fix';
          setApprovalStatus(nextApprovalStatus);
        }
      } catch {
        /* giữ state hiện tại */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'analytics') return;
    if (!isPartnerAuthenticated()) return;
    let cancelled = false;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    void (async () => {
      try {
        const data = await getPartnerAnalytics();
        if (!cancelled) setAnalyticsData(data);
      } catch (err) {
        if (!cancelled) setAnalyticsError(getApiErrorMessage(err, 'Không tải được dữ liệu thống kê.'));
      } finally {
        if (!cancelled) setAnalyticsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab]);

  const renderProfileTab = () => (
    <section className="mx-4 mt-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm animate-stagger-item">
      <h3 className="text-base font-bold text-slate-900">Hồ sơ đối tác & nội dung</h3>
      <p className="mt-1 text-xs text-slate-500">Quản lý hồ sơ doanh nghiệp và nội dung giới thiệu hiển thị trong ứng dụng.</p>

      <div className="mt-3 grid gap-3">
        {loadingProfile && (
          <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs text-slate-500">
            Đang tải hồ sơ...
          </div>
        )}
        <div>
          <label className="text-xs font-semibold text-slate-600">Tên thương hiệu</label>
          <input
            value={draft.businessName}
            onChange={(e) => handleFieldChange('businessName', e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-primary"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600">Địa chỉ</label>
          <input
            value={draft.address}
            onChange={(e) => handleFieldChange('address', e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-primary"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600">Khung giờ mở cửa</label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">Giờ mở</label>
              <input
                type="time"
                value={openingTime.openAt}
                onChange={(e) => handleOpeningTimeChange('openAt', e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">Giờ đóng</label>
              <input
                type="time"
                value={openingTime.closeAt}
                onChange={(e) => handleOpeningTimeChange('closeAt', e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-primary"
              />
            </div>
          </div>
          {/* <p className="mt-1 text-[11px] text-slate-500">
            {draft.openingHours ? `Định dạng lưu: ${draft.openingHours}` : 'Chọn đủ giờ mở và giờ đóng để lưu.'}
          </p> */}
        </div>
        {/* <div>
          <label className="text-xs font-semibold text-slate-600">POI ID (tự động cập nhật)</label>
          <input
            value={partnerPoiId || 'Chưa liên kết POI'}
            readOnly
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100/70 px-3 py-2 text-sm text-slate-700 outline-none"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            QR URL tự tạo từ POI ID theo: {publicBaseUrl}{QR_SCAN_PATH}?code=&lt;poi_id&gt;
          </p>
          <textarea
            value={effectiveQrUrl || 'Chưa có POI ID để tạo QR URL. Hãy tạo/liên kết POI ở tab POI trước.'}
            readOnly
            rows={2}
            className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-100/70 px-3 py-2 text-xs text-slate-600 outline-none"
          />
          {effectiveQrUrl && (
            <div className="mt-2 inline-flex rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
              <QRCodeSVG value={effectiveQrUrl} size={110} bgColor="#ffffff" fgColor="#0f172a" level="M" />
            </div>
          )}
        </div> */}

        <div className="mt-2 rounded-xl border border-slate-100 p-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900">Nội dung giới thiệu</h4>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">Audio ưu tiên, TTS dự phòng</span>
          </div>

          <label className="mt-3 block text-xs font-semibold text-slate-600">Script giới thiệu</label>
          <textarea
            value={draft.introText}
            onChange={(e) => handleFieldChange('introText', e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-primary"
          />
          <div className="mt-3 grid grid-cols-1 gap-2">
            <button
              onClick={() => void handleTestIntro()}
              disabled={introLoading}
              className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-bold text-primary transition hover:bg-primary hover:text-white flex items-center justify-center gap-1 disabled:opacity-60 disabled:pointer-events-none"
            >
              {introLoading ? (
                <>
                  <span className="size-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Đang tải audio...
                </>
              ) : isPlaying ? (
                <>
                  <span className="material-symbols-outlined text-sm">stop_circle</span>
                  Dừng nghe
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">play_circle</span>
                  {partnerPoiId ? 'Nghe thử (audio BE)' : 'Nghe thử (TTS)'}
                </>
              )}
            </button>
          </div>
          <div className="mt-3 grid gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600">Combo/Menu nổi bật</label>
              <input
                value={draft.mustTry}
                onChange={(e) => handleFieldChange('mustTry', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Mức giá</label>
              <input
                value={draft.menuPriceRange}
                onChange={(e) => handleFieldChange('menuPriceRange', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-primary"
              />
            </div>
          </div>

          
        </div>
      </div>

      {profileError && <p className="mt-2 text-xs text-rose-600">{profileError}</p>}
    </section>
  );

  const renderDistributionTab = () => {
    const st = distributionInfo.partnerStatus;
    const statusAccent =
      st === 1
        ? 'from-emerald-500/15 via-emerald-400/5 to-transparent ring-emerald-200/80'
        : st === 2
          ? 'from-amber-500/15 via-amber-400/5 to-transparent ring-amber-200/80'
          : st === 0
            ? 'from-rose-500/15 via-rose-400/5 to-transparent ring-rose-200/80'
            : 'from-slate-400/15 via-slate-300/5 to-transparent ring-slate-200/80';
    const statusIcon =
      st === 1 ? 'verified' : st === 2 ? 'hourglass_top' : st === 0 ? 'block' : 'help';
    const statusBadgeClass =
      st === 1
        ? 'border-emerald-300/60 bg-emerald-50 text-emerald-900 shadow-sm shadow-emerald-500/10'
        : st === 2
          ? 'border-amber-300/60 bg-amber-50 text-amber-950 shadow-sm shadow-amber-500/10'
          : st === 0
            ? 'border-rose-300/60 bg-rose-50 text-rose-950 shadow-sm shadow-rose-500/10'
            : 'border-slate-200 bg-slate-50 text-slate-800';
    const statusHint =
      st === 1
        ? 'Admin đã duyệt — hồ sơ và nội dung liên quan có thể hiển thị theo cấu hình app.'
        : st === 2
          ? 'Admin chưa duyệt — vui lòng chờ hoặc cập nhật hồ sơ theo yêu cầu.'
          : st === 0
            ? 'Hồ sơ không được duyệt hoặc đã bị từ chối. Liên hệ quản trị nếu cần hỗ trợ.'
            : '';

    return (
      <section className="relative mx-4 mt-4 overflow-hidden rounded-2xl border border-slate-100/90 bg-white shadow-sm animate-stagger-item">
        <div className="pointer-events-none absolute -right-16 -top-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-8 -left-10 h-32 w-32 rounded-full bg-orange-200/35 blur-2xl" />

        <div className="relative border-b border-slate-100/90 bg-gradient-to-br from-white via-orange-50/40 to-white px-4 pb-4 pt-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/90 to-primary text-white shadow-md shadow-primary/25">
              <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                dashboard
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary/80">Tổng quan</p>
              <h3 className="mt-0.5 text-base font-bold leading-tight text-slate-900">Tổng quan và lộ trình hiển thị</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Theo dõi trạng thái admin, mốc thời gian POI và hồ sơ — đồng bộ mỗi khi bạn mở tab này.
              </p>
            </div>
          </div>
        </div>

        <div className="relative space-y-3 p-4">
          <div
            className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 ring-1 ${statusAccent} border-white/60`}
          >
            <div className="absolute right-3 top-3 opacity-[0.07]">
              <span className="material-symbols-outlined text-6xl text-slate-900">shield_person</span>
            </div>
            <div className="relative flex flex-wrap items-start gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-white/90 ${statusBadgeClass}`}
              >
                <span className="material-symbols-outlined text-[22px] text-current">{statusIcon}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Trạng thái duyệt</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${statusBadgeClass}`}
                  >
                    <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
                    {adminStyleStatusLabel(distributionInfo.partnerStatus ?? undefined, distributionInfo.statusDisplay)}
                  </span>
                </div>
                {statusHint && (
                  <p className="mt-3 text-xs leading-relaxed text-slate-600">{statusHint}</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="group rounded-2xl border border-slate-100 bg-slate-50/50 p-3.5 transition hover:border-primary/20 hover:bg-white hover:shadow-md hover:shadow-slate-200/60">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-primary shadow-sm ring-1 ring-slate-100">
                  <span className="material-symbols-outlined text-[18px]">location_on</span>
                </span>
                <div>
                  <p className="text-xs font-bold text-slate-900">POI liên kết</p>
                  <p className="text-[10px] text-slate-500">Mốc thời gian địa điểm</p>
                </div>
              </div>
              {partnerPoiId ? (
                <ul className="mt-3 space-y-2">
                  <li className="flex items-start justify-between gap-2 rounded-xl bg-white/80 px-2.5 py-2 ring-1 ring-slate-100/80">
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                      <span className="material-symbols-outlined text-[14px] text-primary/70">event</span>
                      Tạo
                    </span>
                    <span className="text-right text-xs font-semibold tabular-nums text-slate-800">
                      {formatVnDateTime(distributionInfo.poiCreatedAt)}
                    </span>
                  </li>
                  <li className="flex items-start justify-between gap-2 rounded-xl bg-white/80 px-2.5 py-2 ring-1 ring-slate-100/80">
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                      <span className="material-symbols-outlined text-[14px] text-primary/70">update</span>
                      Cập nhật
                    </span>
                    <span className="text-right text-xs font-semibold tabular-nums text-slate-800">
                      {formatVnDateTime(distributionInfo.poiUpdatedAt)}
                    </span>
                  </li>
                </ul>
              ) : (
                <div className="mt-3 flex flex-col items-center rounded-xl border border-dashed border-slate-200 bg-white/60 px-3 py-4 text-center">
                  <span className="material-symbols-outlined text-3xl text-slate-300">map</span>
                  <p className="mt-2 text-xs font-medium text-slate-600">Chưa liên kết POI</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Tạo hoặc gán POI ở tab POI.</p>
                </div>
              )}
            </div>

            <div className="group rounded-2xl border border-slate-100 bg-slate-50/50 p-3.5 transition hover:border-primary/20 hover:bg-white hover:shadow-md hover:shadow-slate-200/60">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-primary shadow-sm ring-1 ring-slate-100">
                  <span className="material-symbols-outlined text-[18px]">badge</span>
                </span>
                <div>
                  <p className="text-xs font-bold text-slate-900">Hồ sơ đối tác</p>
                  <p className="text-[10px] text-slate-500">Lưu và chỉnh sửa hồ sơ</p>
                </div>
              </div>
              <ul className="mt-3 space-y-2">
                <li className="flex items-start justify-between gap-2 rounded-xl bg-white/80 px-2.5 py-2 ring-1 ring-slate-100/80">
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                    <span className="material-symbols-outlined text-[14px] text-primary/70">person_add</span>
                    Tạo hồ sơ
                  </span>
                  <span className="text-right text-xs font-semibold tabular-nums text-slate-800">
                    {formatVnDateTime(distributionInfo.partnerCreatedAt)}
                  </span>
                </li>
                <li className="flex items-start justify-between gap-2 rounded-xl bg-white/80 px-2.5 py-2 ring-1 ring-slate-100/80">
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                    <span className="material-symbols-outlined text-[14px] text-primary/70">edit_calendar</span>
                    Cập nhật gần nhất
                  </span>
                  <span className="text-right text-xs font-semibold tabular-nums text-slate-800">
                    {formatVnDateTime(distributionInfo.partnerUpdatedAt)}
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-rose-200/70 bg-gradient-to-br from-rose-50/90 via-white to-white p-3.5 shadow-sm shadow-rose-100/40">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 ring-1 ring-rose-200/80">
                  <span className="material-symbols-outlined text-[22px]">visibility_off</span>
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900">Tắt hiển thị công khai</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                    Đặt hồ sơ Partner về <span className="font-semibold text-slate-800">không hoạt động</span>. Nếu bạn là{' '}
                    <span className="font-semibold text-slate-800">chủ sở hữu POI</span>, điểm đó cũng được tắt; nếu POI dùng
                    chung, hệ thống có thể giữ nguyên điểm cho đối tác khác.
                  </p>
                  {distributionInfo.partnerStatus === 0 && (
                    <p className="mt-2 text-[11px] font-medium text-rose-700">
                      Hồ sơ đang không hoạt động. Để bật lại, vui lòng liên hệ quản trị viên.
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                disabled={
                  deactivating ||
                  loadingProfile ||
                  distributionInfo.partnerStatus === 0 ||
                  distributionInfo.partnerStatus === null
                }
                onClick={() => void handleDeactivateDisplay()}
                className="shrink-0 rounded-xl border border-rose-300/80 bg-white px-4 py-2.5 text-xs font-bold text-rose-800 shadow-sm transition hover:border-rose-400 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {deactivating ? 'Đang xử lý…' : 'Tắt hiển thị'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-gradient-to-b from-slate-50/80 to-white p-3.5">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-[18px]">smartphone</span>
              </span>
              <div>
                <p className="text-xs font-bold text-slate-900">Hiển thị trên app</p>
                <p className="text-[10px] text-slate-500">Nơi khách hàng thấy thương hiệu bạn</p>
              </div>
            </div>
            <ol className="mt-3 space-y-2">
              {[
                { n: '1', t: 'Bottom sheet gợi ý đối tác khi đang phát thuyết minh.', i: 'bottom_panel_close' },
                { n: '2', t: 'Đoạn intro ngắn sau bài thuyết minh (nếu bật).', i: 'brand_awareness' },
                { n: '3', t: 'Thẻ menu & giờ mở cửa theo POI liên kết.', i: 'restaurant' },
              ].map((row) => (
                <li
                  key={row.n}
                  className="flex gap-2.5 rounded-xl border border-white/60 bg-white/70 px-2.5 py-2 text-xs text-slate-600 shadow-sm shadow-slate-200/40"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[10px] font-extrabold text-primary">
                    {row.n}
                  </span>
                  <span className="min-w-0 flex-1 leading-snug">
                    <span className="mr-1 inline-flex align-middle text-primary/80">
                      <span className="material-symbols-outlined text-[16px]">{row.i}</span>
                    </span>
                    {row.t}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    );
  };

  const renderAnalyticsTab = () => {
    const fmtWow = (v: number | null | undefined): { label: string; up: boolean } | null => {
      if (v == null) return null;
      return { label: `${v > 0 ? '+' : ''}${v}% WoW`, up: v >= 0 };
    };
    const fmtSec = (s: number) => s >= 60 ? `${Math.floor(s / 60)}p${s % 60 > 0 ? ` ${s % 60}s` : ''}` : `${s}s`;

    const stats = analyticsData ? [
      {
        label: 'Lượt nghe',
        value: analyticsData.impressions.toLocaleString('vi-VN'),
        wow: fmtWow(analyticsData.wow_impressions),
        icon: 'hearing',
      },
      {
        label: 'Lượt tương tác',
        value: analyticsData.interactions.toLocaleString('vi-VN'),
        wow: fmtWow(analyticsData.wow_interactions),
        icon: 'touch_app',
      },
      {
        label: 'Lượt QR',
        value: analyticsData.qr_scans.toLocaleString('vi-VN'),
        wow: null,
        icon: 'qr_code_scanner',
      },
      {
        label: 'Thời lượng TB',
        value: fmtSec(analyticsData.avg_listen_sec),
        wow: null,
        icon: 'timer',
      },
    ] : [];

    return (
      <section className="mx-4 mt-4 mb-5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm animate-stagger-item">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>monitoring</span>
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Theo dõi hiệu quả</h3>
            <p className="text-[10px] text-slate-500">Dữ liệu thực • 7 ngày gần nhất</p>
          </div>
        </div>

        {analyticsLoading ? (
          <div className="mt-4 flex flex-col items-center gap-2 py-6">
            <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400">Đang tải dữ liệu...</p>
          </div>
        ) : analyticsError ? (
          <div className="mt-3 rounded-xl bg-rose-50 border border-rose-200 p-3">
            <p className="text-xs font-semibold text-rose-700">{analyticsError}</p>
          </div>
        ) : !analyticsData?.has_poi ? (
          <div className="mt-4 flex flex-col items-center gap-2 py-6 text-center">
            <span className="material-symbols-outlined text-3xl text-slate-300">bar_chart</span>
            <p className="text-sm font-semibold text-slate-600">Chưa có dữ liệu</p>
            <p className="text-xs text-slate-400">Hãy liên kết POI ở tab POI để bắt đầu thu thập số liệu.</p>
          </div>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <div className="flex items-center justify-between">
                    <span className="material-symbols-outlined text-[18px] text-primary/70">{stat.icon}</span>
                    {stat.wow ? (
                      <span className={`text-[10px] font-bold ${stat.wow.up ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {stat.wow.label}
                      </span>
                    ) : <span />}
                  </div>
                  <p className="mt-1 text-lg font-extrabold text-slate-900">{stat.value}</p>
                  <p className="text-[11px] font-medium text-slate-500">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <p className="text-xs font-semibold text-slate-700">Tổng quan chiến dịch</p>
              <p className="mt-1 text-sm font-bold text-primary">{analyticsData.ctr}% CTR</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {analyticsData.interactions} / {analyticsData.impressions} lượt nghe có tương tác thực sự
              </p>
            </div>

            <p className="mt-2 text-center text-[10px] text-slate-400">Dữ liệu từ NarrationLog · cập nhật mỗi lần mở tab</p>
          </>
        )}
      </section>
    );
  };

  return (
    <AppLayout
      title="Partner Hub"
      backPath="/settings"
      hideNav
      contentClassName="bg-background-light pb-24"
      headerAction={(
        <button
          onClick={handlePartnerLogout}
          disabled={loggingOut}
          className="flex size-10 items-center justify-center rounded-full text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
          title="Đăng xuất partner"
        >
          <span className="material-symbols-outlined text-[20px]">logout</span>
        </button>
      )}
    >
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-20 right-[-80px] h-56 w-56 rounded-full bg-primary/12 blur-3xl" />
        <div className="pointer-events-none absolute top-10 left-[-100px] h-52 w-52 rounded-full bg-orange-200/40 blur-3xl" />

        <section className="relative mx-4 mt-4 rounded-3xl border border-primary/10 bg-gradient-to-br from-white via-orange-50/70 to-orange-100/70 p-5 shadow-sm animate-fade-slide-up">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-primary/80">Kênh đối tác</p>
              <h2 className="mt-1 text-lg font-bold leading-tight text-slate-900">{draft.businessName}</h2>
              <p className="mt-1 text-xs text-slate-500">{draft.address || 'Chưa cập nhật địa chỉ'}</p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${statusClassName}`}>{statusLabel}</span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              { label: 'Lượt nghe', value: analyticsData ? analyticsData.impressions.toLocaleString('vi-VN') : '—' },
              { label: 'Tương tác', value: analyticsData ? analyticsData.interactions.toLocaleString('vi-VN') : '—' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-white/70 bg-white/80 p-3 backdrop-blur-sm">
                <p className="text-[11px] font-semibold text-slate-500">{stat.label}</p>
                <p className="mt-1 text-xl font-extrabold tracking-tight text-slate-900">{stat.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-4 mt-4 rounded-2xl border border-slate-100 bg-white p-1 shadow-sm">
          <div className="grid grid-cols-4 gap-1">
            {PARTNER_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-xl px-2 py-2 text-center transition ${
                    isActive ? 'bg-primary text-white shadow-sm' : 'bg-slate-50 text-slate-600'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
                    {tab.icon}
                  </span>
                  <p className="mt-1 text-[10px] font-bold leading-tight">{tab.label}</p>
                </button>
              );
            })}
          </div>
        </section>

        {activeTab === 'profile' && renderProfileTab()}
        {activeTab === 'poi' && (
          distributionInfo.premiumUnlocked ? (
            <PartnerPOI />
          ) : (
            <section className="mx-4 mt-4 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-4 shadow-sm animate-stagger-item">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/20">
                  <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    workspace_premium
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">Premium Partner</p>
                  <h3 className="mt-0.5 text-base font-bold leading-tight text-slate-900">Mở khóa tab POI</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    Nâng cấp để chỉnh sửa POI đã liên kết, cập nhật ảnh bìa và QR map cho đối tác của bạn.
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/80 bg-white/80 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-500">Phí mở khóa</p>
                  <p className="text-xl font-black text-slate-900">{(distributionInfo.premiumPrice || 0).toLocaleString('vi-VN')}₫</p>
                </div>
                <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
                  <li className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px] text-emerald-500">check_circle</span> Chỉnh sửa POI trong Partner Portal</li>
                  <li className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px] text-emerald-500">check_circle</span> Tự động đồng bộ POI sau thanh toán</li>
                  <li className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px] text-emerald-500">check_circle</span> Giữ nguyên toàn bộ hồ sơ Partner hiện tại</li>
                </ul>
                <button
                  type="button"
                  onClick={() => setShowPremiumCheckout(true)}
                  className="mt-4 w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-amber-500/20 transition hover:brightness-105"
                >
                  Mở khóa ngay
                </button>
              </div>
            </section>
          )
        )}
        {activeTab === 'distribution' && renderDistributionTab()}
        {activeTab === 'analytics' && renderAnalyticsTab()}

        <section className="mx-4 mt-4 mb-5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm animate-stagger-item">
          <button
            onClick={handleSaveDraft}
            disabled={savingProfile}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-lg shadow-primary/20 transition hover:bg-primary-dark disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {savingProfile ? 'Đang lưu...' : 'Lưu thay đổi đối tác'}
          </button>
          {savedAt && <p className="mt-2 text-center text-[11px] font-medium text-emerald-600">Đã lưu lúc {savedAt}</p>}
        </section>
      </div>
      {showPremiumCheckout && (
        <PartnerPremiumCheckout
          amount={distributionInfo.premiumPrice || 0}
          onClose={() => setShowPremiumCheckout(false)}
          onSuccess={handlePremiumSuccess}
        />
      )}
    </AppLayout>
  );
}
