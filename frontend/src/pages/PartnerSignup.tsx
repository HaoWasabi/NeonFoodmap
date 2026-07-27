import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SketchAuthLayout from '../components/SketchAuthLayout';
import { getApiErrorMessage, isPartnerAuthenticated, signupPartner } from '../services/api';

const resolveNextPath = (next: string | null) => next && next.startsWith('/') ? next : '/partner';

export default function PartnerSignup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const nextPath = useMemo(() => resolveNextPath(new URLSearchParams(location.search).get('next')), [location.search]);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  if (isPartnerAuthenticated()) return <Navigate to={nextPath} replace />;
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setErrorMessage(''); if (password !== confirmPassword) { setErrorMessage(t('settings.errorPasswordMismatch')); return; } setSubmitting(true); try { await signupPartner({ identifier: identifier.trim(), password, password_confirm: confirmPassword, business_name: businessName.trim(), address: address.trim() }); navigate(nextPath, { replace: true }); } catch (error) { setErrorMessage(getApiErrorMessage(error, t('auth.authFailed'))); } finally { setSubmitting(false); } };
  return <SketchAuthLayout partner title={t('auth.partnerTitle')} description={t('auth.partnerDescriptionSignup')}><div className="sketch-auth-tabs"><button onClick={() => navigate(`/partner/login?next=${encodeURIComponent(nextPath)}`)}>{t('common.login')}</button><button className="is-active">{t('auth.partnerSignup')}</button></div><div className="sketch-auth-body"><h2>{t('auth.partnerSignupHeader')}</h2><p>{t('auth.partnerSignupSub')}</p><form className="sketch-auth-form" onSubmit={submit}><div className="sketch-field"><label htmlFor="signup-identifier">{t('auth.identifier')}</label><input id="signup-identifier" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required autoComplete="username" placeholder={t('auth.identifierPlaceholder')} /></div><div className="sketch-field"><label htmlFor="signup-password">{t('auth.appPassword')}</label><div className="sketch-password"><input id="signup-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" placeholder="••••••••" /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? t('auth.hide') : t('auth.show')}</button></div></div><div className="sketch-field"><label htmlFor="signup-confirm">{t('auth.confirmPassword')}</label><input id="signup-confirm" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required autoComplete="current-password" placeholder={t('auth.confirmPasswordPlaceholder')} /></div><div className="sketch-field"><label htmlFor="business-name">{t('auth.businessName')}</label><input id="business-name" value={businessName} onChange={(event) => setBusinessName(event.target.value)} required placeholder={t('auth.businessNamePlaceholder')} /></div><div className="sketch-field"><label htmlFor="business-address">{t('auth.address')}</label><input id="business-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder={t('auth.addressPlaceholder')} /></div>{errorMessage && <div className="sketch-auth-error">{errorMessage}</div>}<button className="sketch-btn sketch-btn-tertiary sketch-auth-submit" type="submit" disabled={submitting || !businessName.trim()}>{submitting ? t('auth.creatingProfile') : t('auth.createProfile')}</button></form><p className="sketch-auth-note">{t('auth.hasPartnerProfile')}<Link to={`/partner/login?next=${encodeURIComponent(nextPath)}`}>{t('auth.partnerLoginHeader')}</Link></p></div></SketchAuthLayout>;
}
