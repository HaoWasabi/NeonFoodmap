import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import PartnerPremiumCheckout from '../components/PartnerPremiumCheckout';
import PartnerPOI from '../components/PartnerPOI';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import apiClient, { deactivatePartnerAccount, getApiErrorMessage, getPartnerAccountProfile, getPartnerAnalytics, isPartnerAuthenticated, logoutPartner, upsertPartnerAccountProfile, type PartnerAnalyticsData } from '../services/api';
import type { Media } from '../types';

type PartnerTab = 'profile' | 'poi' | 'distribution' | 'analytics';
type ApprovalStatus = 'pending' | 'approved' | 'needs_fix';
interface Draft { businessName: string; address: string; introText: string; openingHours: string; mustTry: string; menuPriceRange: string; }
interface MenuItem { name: string; category: string; price: number; mark: string; available: boolean; }
const DEFAULT_DRAFT: Draft = { businessName: '', address: '', introText: '', openingHours: '', mustTry: '', menuPriceRange: '' };
const MENU: MenuItem[] = [{ name: 'Ốc Hương Hoàng Kim', category: 'Món signature', price: 185000, mark: '01', available: true }, { name: 'Ốc len xào dừa', category: 'Món signature', price: 95000, mark: '02', available: true }, { name: 'Sò điệp nướng mỡ hành', category: 'Món signature', price: 125000, mark: '03', available: true }];

const LANGUAGE_OPTIONS = [
  { value: 'vi', label: 'Tiếng Việt', code: 'VI' },
  { value: 'en', label: 'English', code: 'EN' },
  { value: 'zh', label: '中文', code: 'ZH' },
  { value: 'ja', label: '日本語', code: 'JA' },
  { value: 'ko', label: '한국어', code: 'KO' },
];

const MEDIA_LANGUAGE_LABELS: Record<string, string> = {
  vi: 'Tiếng Việt', en: 'English', ja: '日本語', ko: '한국어', zh: '中文', fr: 'Français', de: 'Deutsch', es: 'Español', th: 'ภาษาไทย',
};

const VOICE_REGION_LABELS: Record<string, string> = {
  mien_nam: 'Miền Nam', mien_bac: 'Miền Bắc', mien_trung: 'Miền Trung', usa: 'USA', uk: 'UK',
};

function languageToBCP47(code: string): string {
  const map: Record<string, string> = { vi: 'vi-VN', en: 'en-US', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', th: 'th-TH' };
  return map[code] ?? `${code}-${code.toUpperCase()}`;
}

function parseHours(value: string) { const match = value.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/); return { open: match?.[1] || '', close: match?.[2] || '' }; }
function statusFromNumber(status?: number): ApprovalStatus { return status === 1 ? 'approved' : status === 0 ? 'needs_fix' : 'pending'; }
function publicQrUrl(poiId: string) { return `${window.location.origin}/api/pois/scan/?code=${encodeURIComponent(poiId ? `POI_${poiId}` : 'POI-VK-088')}`; }

export default function PartnerPortal() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const TABS: Array<{ id: PartnerTab; label: string; no: string }> = [
    { id: 'profile', label: t('partnerPortal.tab01'), no: '01' },
    { id: 'poi', label: t('partnerPortal.tab02'), no: '02' },
    { id: 'distribution', label: t('partnerPortal.tab03'), no: '03' },
    { id: 'analytics', label: t('partnerPortal.tab04'), no: '04' },
  ];
  const [activeTab, setActiveTab] = useState<PartnerTab>('profile');
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>('pending');
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [partnerPoiId, setPartnerPoiId] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [showPremiumCheckout, setShowPremiumCheckout] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrGenerated, setQrGenerated] = useState(false);
  const [audioSource, setAudioSource] = useState<'tts' | 'audio'>('tts');
  const [voice, setVoice] = useState<'south' | 'north' | 'central'>('south');
  const [analyticsData, setAnalyticsData] = useState<PartnerAnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [premiumUnlocked, setPremiumUnlocked] = useState(false);
  const [premiumPrice, setPremiumPrice] = useState(299000);
  const { isPlaying, speakTTS, pause, load, play } = useAudioPlayer();
  // Multilingual narration state (profile tab)
  const [profileMedia, setProfileMedia] = useState<Media[]>([]);
  const [profileMediaLang, setProfileMediaLang] = useState<string>('');
  const [playingMediaId, setPlayingMediaId] = useState<string | null>(null);

  const handleChangeLanguage = (lang: string) => {
    localStorage.setItem('bcsd_language', lang);
    void i18n.changeLanguage(lang);
  };

  const setField = (key: keyof Draft, value: string) => setDraft((prev) => ({ ...prev, [key]: value }));
  const hours = useMemo(() => parseHours(draft.openingHours), [draft.openingHours]);
  const qrValue = useMemo(() => publicQrUrl(partnerPoiId), [partnerPoiId]);
  const statusLabel = approvalStatus === 'approved' ? t('partnerPortal.verified') : approvalStatus === 'needs_fix' ? t('partnerPortal.needsFix') : t('partnerPortal.pendingApproval');

  const menu = useMemo<MenuItem[]>(() => {
    const raw = draft.mustTry ? draft.mustTry.split(',').map((s) => s.trim()).filter(Boolean) : [];
    if (raw.length > 0) {
      return raw.map((item, idx) => ({
        name: item,
        category: 'Món đặc trưng',
        price: 0,
        mark: String(idx + 1).padStart(2, '0'),
        available: true,
      }));
    }
    return MENU;
  }, [draft.mustTry]);
  const availableMenu = menu.filter((item) => item.available);

  // Derived media languages & filtered list
  const profileMediaLanguages = useMemo(() => [...new Set(profileMedia.map(m => m.language))].sort((a, b) => a.localeCompare(b)), [profileMedia]);
  const filteredProfileMedia = profileMediaLang ? profileMedia.filter(m => m.language === profileMediaLang) : [];

  useEffect(() => {
    if (profileMediaLanguages.length === 0) { setProfileMediaLang(''); return; }
    setProfileMediaLang((prev) => profileMediaLanguages.some(c => c === prev) ? prev : profileMediaLanguages[0]);
  }, [profileMediaLanguages]);

  const playProfileMediaRow = async (m: Media) => {
    if (playingMediaId === String(m.id) && isPlaying) { pause(); setPlayingMediaId(null); return; }
    pause();
    setPlayingMediaId(String(m.id));
    if (m.file_url?.trim()) {
      await load(m.file_url);
      await play();
    } else {
      const text = (m.tts_content || draft.introText || '').trim();
      if (!text) { setPlayingMediaId(null); return; }
      speakTTS(text, languageToBCP47(m.language));
    }
  };

  const applyProfile = (data: Awaited<ReturnType<typeof getPartnerAccountProfile>>) => {
    setApprovalStatus(statusFromNumber(data.status)); setPartnerPoiId(data.poi ? String(data.poi) : ''); setPremiumUnlocked(Boolean(data.is_premium_unlocked)); setPremiumPrice(Number(data.premium_price || 299000)); setDraft({ businessName: data.business_name || '', address: data.address || '', introText: data.intro_text || '', openingHours: data.opening_hours || '', mustTry: data.menu_details?.must_try?.join(', ') || '', menuPriceRange: data.menu_details?.price_range || '' });
  };
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (!isPartnerAuthenticated()) { navigate('/partner/login?next=%2Fpartner', { replace: true }); return; }
        const data = await getPartnerAccountProfile();
        if (!cancelled) {
          applyProfile(data);
          // Fetch media for the partner's POI to show multilingual narration
          if (data.poi) {
            try {
              const { data: poiData } = await apiClient.get(`/pois/${data.poi}/`);
              if (!cancelled && Array.isArray(poiData?.media)) {
                setProfileMedia(poiData.media);
              }
            } catch { /* ignore - media is optional */ }
          }
        }
      } catch (error) { if (!cancelled) setProfileError(getApiErrorMessage(error, 'Không thể tải hồ sơ đối tác.')); }
      finally { if (!cancelled) setLoadingProfile(false); }
    })();
    return () => { cancelled = true; };
  }, [navigate]);
  useEffect(() => {
    if ((activeTab !== 'analytics' && activeTab !== 'distribution') || !isPartnerAuthenticated()) return;
    let cancelled = false; setAnalyticsLoading(true); setAnalyticsError(null);
    void (async () => { try { const data = await getPartnerAnalytics(); if (!cancelled) setAnalyticsData(data); } catch (error) { if (!cancelled) setAnalyticsError(getApiErrorMessage(error, 'Không tải được dữ liệu thống kê.')); } finally { if (!cancelled) setAnalyticsLoading(false); } })();
    return () => { cancelled = true; };
  }, [activeTab]);

  const saveProfile = async () => {
    setSaving(true); setProfileError('');
    try { const data = await upsertPartnerAccountProfile({ business_name: draft.businessName, address: draft.address, intro_text: draft.introText, opening_hours: draft.openingHours, menu_details: { must_try: draft.mustTry.split(',').map((item) => item.trim()).filter(Boolean), price_range: draft.menuPriceRange } }); applyProfile(data) } catch (error) { setProfileError(getApiErrorMessage(error, 'Không thể lưu hồ sơ. Vui lòng thử lại.')); } finally { setSaving(false); }
  };
  const logout = async () => { setLoggingOut(true); try { await logoutPartner(); } finally { navigate('/partner/login?next=%2Fpartner', { replace: true }); setLoggingOut(false); } };
  const testIntro = () => { if (isPlaying) { pause(); return; } if (draft.introText) speakTTS(draft.introText, 'vi-VN'); };
  const deactivate = async () => { if (!window.confirm('Bạn sắp tắt hiển thị hồ sơ đối tác. Tiếp tục?')) return; try { const result = await deactivatePartnerAccount(); applyProfile(result.profile); window.alert(result.message); } catch (error) { window.alert(getApiErrorMessage(error, 'Không thể tắt hiển thị. Vui lòng thử lại.')); } };

  const renderLivePreview = (mode: 'story' | 'menu' = 'story') => <aside className="partner-live-preview partner-panel"><div className="partner-panel-head"><div><h2>{t('partnerPortal.livePreview')}</h2><p>{t('partnerPortal.livePreviewDesc')}</p></div><span className="sketch-chip sketch-chip-primary">{t('partnerPortal.live')}</span></div><div className="partner-panel-body"><div className="partner-phone"><div className="partner-phone-media"><div className="partner-phone-copy"><span className="sketch-label">Vĩnh Khánh · Món ngon</span><h3>{draft.businessName || 'Ốc Oanh · Vĩnh Khánh'}</h3><span className="sketch-mono">02:18 · {t('partnerPortal.voiceRegion').toUpperCase()} {voice === 'south' ? t('partnerPortal.voiceSouth').toUpperCase() : voice === 'north' ? t('partnerPortal.voiceNorth').toUpperCase() : t('partnerPortal.voiceCentral').toUpperCase()}</span></div></div><div className="partner-phone-detail"><strong>{draft.businessName || 'Ốc Oanh'}</strong><p>{draft.address || '534 Vĩnh Khánh · Quận 4'} · {draft.openingHours || '17:00 - 23:00'}</p><p>{(draft.introText || t('partnerPortal.narrationPlaceholder')).slice(0, 170)}</p>{mode === 'menu' ? <div className="partner-menu-ledger">{availableMenu.map((item) => <div className="partner-menu-row" key={item.name}><span>{item.mark}</span><strong>{item.name}</strong><span>{item.price.toLocaleString('vi-VN')}₫</span></div>)}</div> : <div className="partner-audio-player"><button type="button" onClick={testIntro}>{isPlaying ? 'Ⅱ' : '▶'}</button><div><strong>{t('partnerPortal.audioNarration')}</strong><div className="partner-wave">{[7, 14, 10, 20, 12, 18, 8, 16].map((height, index) => <i key={index} style={{ height }} />)}</div></div><span>02:18</span></div>}</div></div></div></aside>;

  const profileView = <><div className="partner-view-head"><div><span className="sketch-label" style={{ color: 'var(--sk-tertiary)' }}>01 · {t('partnerPortal.profileLabel')}</span><h1>{t('partnerPortal.profileTitle')}</h1><p>{t('partnerPortal.profileDesc')}</p></div><div className="partner-head-actions"><button className="sketch-btn sketch-btn-outline" onClick={testIntro}>{t('partnerPortal.listenPreview')}</button><button className="sketch-btn sketch-btn-tertiary" onClick={() => void saveProfile()} disabled={saving}>{saving ? t('partnerPortal.saving') : t('partnerPortal.saveAndSubmit')}</button></div></div><div className="partner-workspace"><div className="partner-stack"><section className="partner-panel"><div className="partner-panel-head"><div><h2>{t('partnerPortal.basicInfo')}</h2><p>{t('partnerPortal.basicInfoDesc')}</p></div><span className="sketch-chip sketch-chip-primary">{statusLabel}</span></div><div className="partner-panel-body"><div className="partner-status-strip"><div><strong>{t('partnerPortal.profilePublic')}</strong><span>{t('partnerPortal.profilePublicNote')}</span></div><span className="sketch-mono">POI-{partnerPoiId || 'VK-088'}</span></div>{loadingProfile ? <p className="partner-error">{t('partnerPortal.loadingProfile')}</p> : <div className="partner-form-grid"><div className="sketch-field"><label>{t('partnerPortal.restaurantName')}</label><input value={draft.businessName} onChange={(event) => setField('businessName', event.target.value)} /></div><div className="sketch-field"><label>{t('partnerPortal.openingHoursLabel')}</label><div className="partner-form-grid"><input type="time" value={hours.open} onChange={(event) => setField('openingHours', `${event.target.value} - ${hours.close}`)} /><input type="time" value={hours.close} onChange={(event) => setField('openingHours', `${hours.open} - ${event.target.value}`)} /></div></div><div className="sketch-field wide"><label>{t('partnerPortal.streetAddress')}</label><input value={draft.address} onChange={(event) => setField('address', event.target.value)} /></div><div className="sketch-field wide"><label>{t('partnerPortal.priceRange')}</label><input value={draft.menuPriceRange} onChange={(event) => setField('menuPriceRange', event.target.value)} placeholder="80,000 - 250,000 VND" /></div></div>}</div></section><section className="partner-panel"><div className="partner-panel-head"><div><h2>{t('partnerPortal.audioStudio')}</h2><p>{t('partnerPortal.audioStudioDesc')}</p></div></div><div className="partner-panel-body"><div className="partner-segmented"><button className={audioSource === 'tts' ? 'is-active' : ''} onClick={() => setAudioSource('tts')}>{t('partnerPortal.ttsAuto')}</button><button className={audioSource === 'audio' ? 'is-active' : ''} onClick={() => setAudioSource('audio')}>{t('partnerPortal.uploadMp3')}</button></div>{audioSource === 'tts' ? <><div className="sketch-field"><label>{t('partnerPortal.storyTitle')}</label><input value={draft.businessName || 'Bếp than đỏ giữa phố đêm'} onChange={(event) => setField('businessName', event.target.value)} /></div><div className="sketch-field"><label>{t('partnerPortal.narrationContent')}</label><textarea rows={6} value={draft.introText} onChange={(event) => setField('introText', event.target.value)} placeholder={t('partnerPortal.narrationPlaceholder')} /><small className="sketch-mono">Khoảng 92 giây · tối ưu cho một điểm dừng ngắn.</small></div><div className="sketch-field"><label>{t('partnerPortal.voiceRegion')}</label><div className="partner-voice">{[['south', t('partnerPortal.voiceSouth')], ['north', t('partnerPortal.voiceNorth')], ['central', t('partnerPortal.voiceCentral')]].map(([id, label]) => <button key={id} className={voice === id ? 'is-active' : ''} onClick={() => setVoice(id as typeof voice)}>{label}</button>)}</div></div><div className="partner-audio-player"><button type="button" onClick={testIntro}>{isPlaying ? 'Ⅱ' : '▶'}</button><div><strong>{draft.businessName || 'Audio intro'}</strong><span>VOICE_{voice.toUpperCase()} · TTS PREVIEW</span><div className="partner-wave">{[8, 18, 13, 25, 10, 21, 15, 24, 9, 20, 13].map((height, index) => <i key={index} style={{ height }} />)}</div></div><span className="sketch-mono">00:38 / 01:32</span></div></> : <div className="partner-upload"><strong>{t('partnerPortal.uploadProfessionalAudio')}</strong><span>{t('partnerPortal.uploadLimit')}</span><input type="file" accept="audio/*" /></div>}</div></section>{/* Multilingual Narration Section */}{profileMedia.length > 0 && <section className="partner-panel"><div className="partner-panel-head"><div><h2>{t('partnerPortal.multiLangNarration')}</h2><p>{t('partnerPortal.multiLangNarrationDesc')}</p></div><div style={{ minWidth: 160 }}><label className="sketch-label" style={{ marginBottom: 4, display: 'block' }}>{t('partnerPortal.selectLanguage')}</label><select value={profileMediaLang} onChange={(e) => setProfileMediaLang(e.target.value)} className="sketch-field" style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--sk-border, #e2e8f0)' }}>{profileMediaLanguages.map((code) => <option key={code} value={code}>{MEDIA_LANGUAGE_LABELS[code] ?? code.toUpperCase()}</option>)}</select></div></div><div className="partner-panel-body">{filteredProfileMedia.length === 0 ? <p style={{ color: 'var(--sk-muted)', fontSize: '0.85rem' }}>{t('partnerPortal.noMediaAvailable')}</p> : <ul style={{ display: 'grid', gap: 8 }}>{filteredProfileMedia.map((m) => { const isRowPlaying = playingMediaId === String(m.id) && isPlaying; const canPlay = Boolean(m.file_url?.trim()) || Boolean((m.tts_content || draft.introText || '').trim()); return <li key={m.id} style={{ borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', padding: '10px 12px' }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><div style={{ minWidth: 0, flex: 1 }}><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}><span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 6 }}>{m.media_type === 'TTS' ? 'TTS' : t('partnerPortal.listen')}</span><span style={{ color: '#64748b' }}>{VOICE_REGION_LABELS[m.voice_region] ?? m.voice_region}</span></div>{m.tts_content?.trim() ? <p style={{ marginTop: 4, fontSize: 12, color: '#475569', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.tts_content}</p> : m.file_url ? <p style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>File âm thanh đã tải lên</p> : <p style={{ marginTop: 4, fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>{t('partnerPortal.noMediaAvailable')}</p>}</div><button type="button" disabled={!canPlay} onClick={() => void playProfileMediaRow(m)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(var(--sk-primary-rgb, 59 130 246) / 0.3)', background: isRowPlaying ? 'var(--sk-primary, #3b82f6)' : 'rgba(var(--sk-primary-rgb, 59 130 246) / 0.05)', color: isRowPlaying ? '#fff' : 'var(--sk-primary, #3b82f6)', fontSize: 12, fontWeight: 700, cursor: canPlay ? 'pointer' : 'not-allowed', opacity: canPlay ? 1 : 0.4 }}><span className="material-symbols-outlined" style={{ fontSize: 18 }}>{isRowPlaying ? 'stop_circle' : 'play_circle'}</span>{isRowPlaying ? t('partnerPortal.stop') : t('partnerPortal.listen')}</button></div></li>; })}</ul>}</div></section>}{profileError && <p className="partner-error">{profileError}</p>}</div>{renderLivePreview('story')}</div></>;

  const poiView = <><div className="partner-view-head"><div><span className="sketch-label" style={{ color: 'var(--sk-tertiary)' }}>02 · {t('partnerPortal.tab02')}</span><h1>{t('partnerPortal.profileTitle')}</h1><p>{t('partnerPortal.profileDesc')}</p></div></div>{premiumUnlocked ? <div className="partner-workspace"><div className="partner-stack"><div className="partner-poi-band"><div><strong>Trạm Phố Ẩm Thực Vĩnh Khánh · Đoạn 1</strong><span>10.7579°N · 106.7031°E · POI-{partnerPoiId || 'VK-088'}</span></div><span className="sketch-chip sketch-chip-tertiary" style={{ color: '#fff' }}>{t('partnerPortal.verified')}</span></div><PartnerPOI /></div>{renderLivePreview('menu')}</div> : <section className="partner-panel"><div className="partner-panel-body"><span className="sketch-chip sketch-chip-tertiary">Premium Partner</span><h2>{t('partnerPortal.tab02')}</h2><p className="partner-view-head">{t('partnerPortal.profileDesc')}</p><button className="sketch-btn sketch-btn-tertiary" onClick={() => setShowPremiumCheckout(true)}>{t('partnerPortal.listenPreview')} · {premiumPrice.toLocaleString('vi-VN')}₫</button></div></section>}</>;

  const distributionView = <><div className="partner-view-head"><div><span className="sketch-label" style={{ color: 'var(--sk-tertiary)' }}>03 · {t('partnerPortal.tab03')}</span><h1>{t('partnerPortal.profileTitle')}</h1><p>{t('partnerPortal.profileDesc')}</p></div><div className="partner-head-actions"><button className="sketch-btn sketch-btn-outline" onClick={() => setShowQrModal(true)}>{t('common.viewAll')}</button><button className="sketch-btn sketch-btn-tertiary" onClick={() => setQrGenerated(true)}>QR Standee</button></div></div><div className="partner-workspace"><div className="partner-stack"><section className="partner-panel"><div className="partner-panel-head"><div><h2>QR Standee Generator</h2><p>{t('partnerPortal.basicInfoDesc')}</p></div></div><div className="partner-panel-body"><div className="partner-qr-workspace"><div className="partner-standee"><div className="partner-standee-head"><span className="sketch-script">NeonFoodmap</span><strong>{draft.businessName || 'Ốc Oanh · Vĩnh Khánh'}</strong></div><div className="partner-qr-preview"><QRCodeSVG id="partner-qr-svg" value={qrValue} size={190} level="M" includeMargin /></div><div className="partner-standee-copy"><strong>{t('partnerPortal.audioNarration')}</strong><span>POI-{partnerPoiId || 'VK-088'} · Audio 02:18 · VI / EN</span></div></div><div className="partner-stack"><div className="sketch-field"><label>{t('partnerPortal.selectLanguage')}</label><select><option>Biển hiệu mặt tiền</option><option>Quầy gọi món</option><option>Bàn 01</option><option>Bàn 02</option></select></div><div className="sketch-field"><label>CTA</label><input defaultValue="QUÉT ĐỂ NGHE CÂU CHUYỆN" /></div><button className="sketch-btn sketch-btn-tertiary" disabled={!qrGenerated} onClick={() => window.print()}>PNG / SVG</button><button className="sketch-btn sketch-btn-outline" disabled={!qrGenerated} onClick={() => window.print()}>Print</button></div></div></div></section><section className="partner-panel"><div className="partner-panel-head"><div><h2>{t('partnerPortal.tab03')}</h2><p>{t('partnerPortal.basicInfoDesc')}</p></div><span className="sketch-chip sketch-chip-primary">{analyticsData?.distribution_points?.length ? `${String(analyticsData.distribution_points.length).padStart(2, '0')} Active` : '—'}</span></div><div className="partner-panel-body">{analyticsLoading ? <p className="partner-error">{t('common.loading')}</p> : analyticsData?.distribution_points && analyticsData.distribution_points.length > 0 ? <div className="partner-distribution-ledger">{analyticsData.distribution_points.map((point) => <div className="partner-distribution-row" key={point.id}><span>{point.id}</span><div><strong>{point.label}</strong><small>{point.type === 'poi' ? 'Audio + POI' : 'Menu / Link'}</small></div><span>{point.scans.toLocaleString('vi-VN')} scans</span><button className="sketch-btn sketch-btn-outline">{t('common.retry')}</button></div>)}</div> : <p style={{ color: 'var(--sk-muted)', fontSize: '0.85rem' }}>{t('partnerPortal.noMediaAvailable')}</p>}</div></section><div className="partner-premium-band"><div><h3>{premiumUnlocked ? 'Partner Premium' : 'Partner Premium'}</h3><p>{t('partnerPortal.profileDesc')}</p><div className="partner-premium-benefits"><span>Geofence autoplay</span><span>Map badge 2D / 2.5D</span><span>{t('partnerPortal.tab04')}</span></div></div><button className="sketch-btn" disabled={premiumUnlocked} onClick={() => setShowPremiumCheckout(true)}>{premiumUnlocked ? t('partnerPortal.verified') : 'PayPal'}</button></div><section className="partner-panel"><div className="partner-panel-body"><button className="sketch-btn sketch-btn-danger" onClick={() => void deactivate()}>{t('settings.logout')}</button></div></section></div>{renderLivePreview('story')}</div></>;

  const analyticsView = <><div className="partner-view-head"><div><span className="sketch-label" style={{ color: 'var(--sk-secondary)' }}>04 · {t('partnerPortal.tab04')}</span><h1>{t('partnerPortal.profileTitle')}</h1><p>{t('partnerPortal.profileDesc')}</p></div><span className="sketch-chip sketch-chip-secondary">{t('partnerPortal.live')}</span></div><div className="partner-workspace"><div className="partner-stack">{analyticsLoading && <p className="partner-error">{t('common.loading')}</p>}{analyticsError && <p className="partner-error">{analyticsError}</p>}<div className="partner-analytics-metrics"><div className="partner-analytics-metric"><span>{t('partnerPortal.audioNarration')}</span><strong>{analyticsData ? analyticsData.impressions.toLocaleString('vi-VN') : '—'}</strong></div><div className="partner-analytics-metric"><span>{t('partnerPortal.listenPreview')}</span><strong>{analyticsData ? `${Math.round(analyticsData.avg_listen_sec)}s` : '—'}</strong></div><div className="partner-analytics-metric"><span>QR</span><strong>{analyticsData ? analyticsData.qr_scans.toLocaleString('vi-VN') : '—'}</strong></div><div className="partner-analytics-metric"><span>{t('partnerPortal.tab02')}</span><strong style={{ fontFamily: 'var(--sk-body)', fontSize: '1rem' }}>{analyticsData?.top_dishes?.[0]?.name || '—'}</strong></div></div><section className="partner-panel"><div className="partner-panel-head"><div><h2>{t('partnerPortal.tab04')}</h2><p>{analyticsData?.hourly_breakdown ? (() => { const peak = analyticsData.hourly_breakdown.reduce((max, h) => h.count > max.count ? h : max, { hour: 0, count: 0 }); return peak.count > 0 ? `Peak: ${peak.hour}:00` : '—'; })() : t('common.loading')}</p></div>{analyticsData?.hourly_breakdown && (() => { const peak = analyticsData.hourly_breakdown.reduce((max, h) => h.count > max.count ? h : max, { hour: 0, count: 0 }); return peak.count > 0 ? <span className="sketch-chip sketch-chip-secondary">Peak {peak.hour}:00</span> : null; })()}</div><div className="partner-panel-body"><div className="partner-chart">{(() => { if (!analyticsData?.hourly_breakdown) return <p style={{ color: 'var(--sk-muted)', fontSize: '0.85rem' }}>—</p>; const eveningHours = analyticsData.hourly_breakdown.filter(h => h.hour >= 6 && h.hour <= 23); const maxCount = Math.max(...eveningHours.map(h => h.count), 1); return eveningHours.map((h) => <div className="partner-chart-column" key={h.hour}><div className="partner-chart-bar-wrap"><div className="partner-chart-bar" style={{ height: `${Math.round(h.count / maxCount * 100)}%` }} /></div><span>{h.hour}:00</span></div>); })()}</div></div></section><section className="partner-panel"><div className="partner-panel-head"><div><h2>{t('partnerPortal.tab02')}</h2><p>{t('partnerPortal.basicInfoDesc')}</p></div></div><div className="partner-panel-body"><div className="partner-interest-ledger">{analyticsData?.top_dishes && analyticsData.top_dishes.length > 0 ? analyticsData.top_dishes.map((dish) => <div className="partner-interest-row" key={dish.rank}><span>{String(dish.rank).padStart(2, '0')}</span><strong>{dish.name}</strong><span>{dish.views.toLocaleString('vi-VN')}</span></div>) : <p style={{ color: 'var(--sk-muted)', fontSize: '0.85rem' }}>{t('partnerPortal.noMediaAvailable')}</p>}</div></div></section></div>{renderLivePreview('menu')}</div></>;

  return <div className="partner-portal-page"><header className="partner-portal-topbar"><div className="partner-portal-brand"><span className="sketch-script">NeonFoodmap</span><span>{t('partnerPortal.adminPortal')} · {draft.businessName || 'Ốc Oanh · Phố Ẩm Thực Vĩnh Khánh'}</span></div><div className="partner-status-meta"><select value={i18n.language} onChange={(e) => handleChangeLanguage(e.target.value)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 600, background: 'rgba(255,255,255,0.15)', color: '#fff', marginRight: 8, cursor: 'pointer' }} aria-label={t('partnerPortal.languageSetting')}>{LANGUAGE_OPTIONS.map((l) => <option key={l.value} value={l.value} style={{ color: '#1e293b', background: '#fff' }}>{l.code}</option>)}</select><span className="sketch-chip sketch-chip-primary">{statusLabel}</span><span className="partner-poi-id">POI-{partnerPoiId || 'VK-088'}</span><button className="partner-exit" onClick={() => void logout()} aria-label={t('partnerPortal.venue')}>{loggingOut ? '…' : '↗'}</button></div></header><nav className="partner-mobile-tabs">{TABS.map((tab) => <button key={tab.id} className={activeTab === tab.id ? 'is-active' : ''} onClick={() => setActiveTab(tab.id)}>{tab.no}. {tab.label}</button>)}</nav><div className="partner-portal-shell"><aside className="partner-sidebar"><div className="partner-summary"><div className="partner-avatar">OO</div><span className="sketch-label">{t('partnerPortal.venue')}</span><h2>{draft.businessName || 'Ốc Oanh · Vĩnh Khánh'}</h2><p>{draft.address || '534 Vĩnh Khánh · Quận 4'}</p><div className="partner-summary-line"><span className="sketch-chip sketch-chip-primary">{statusLabel}</span><span className="sketch-mono">POI-{partnerPoiId || 'VK-088'}</span></div></div><nav className="partner-menu">{TABS.map((tab) => <button key={tab.id} className={activeTab === tab.id ? 'is-active' : ''} onClick={() => setActiveTab(tab.id)}><span>{tab.no}</span><strong>{tab.label}</strong><span>→</span></button>)}</nav><div className="partner-sidebar-foot"><div className="partner-tier"><strong>{premiumUnlocked ? 'Partner Premium' : 'Partner Standard'}</strong><span>{premiumUnlocked ? 'Geofence · Analytics · Badge' : t('partnerPortal.venue')}</span></div><button className="sketch-btn sketch-btn-tertiary" disabled={premiumUnlocked} onClick={() => setShowPremiumCheckout(true)}>{premiumUnlocked ? t('partnerPortal.verified') : t('partnerPortal.tab02')}</button><button className="sketch-btn sketch-btn-outline" onClick={() => navigate('/invoice')}>{t('settings.invoices')}</button><div style={{ marginTop: 8 }}><label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{t('partnerPortal.languageSetting')}</label><select value={i18n.language} onChange={(e) => handleChangeLanguage(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>{LANGUAGE_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select></div></div></aside><main className="partner-main">{activeTab === 'profile' && profileView}{activeTab === 'poi' && poiView}{activeTab === 'distribution' && distributionView}{activeTab === 'analytics' && analyticsView}</main></div>{showQrModal && <div className="tour-modal" role="dialog" aria-modal="true"><div className="tour-modal-box"><div className="tour-modal-head"><h2>{t('partnerPortal.adminPortal')}</h2><button className="sketch-icon-button" onClick={() => setShowQrModal(false)} aria-label={t('common.close')}>×</button></div><div className="tour-modal-body"><QRCodeSVG value={qrValue} size={240} includeMargin /><p>QR dẫn tới POI liên kết. Tạo xong có thể in hoặc tải từ trình duyệt.</p><button className="sketch-btn sketch-btn-tertiary" onClick={() => { setQrGenerated(true); setShowQrModal(false); }}>{t('common.save')}</button></div></div></div>}{showPremiumCheckout && <PartnerPremiumCheckout amount={premiumPrice} onClose={() => setShowPremiumCheckout(false)} onSuccess={() => { setShowPremiumCheckout(false); setPremiumUnlocked(true); }} />}</div>;
}
