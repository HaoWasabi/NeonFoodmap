import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SketchAuthLayout from '../components/SketchAuthLayout';
import { getApiErrorMessage, isPartnerAuthenticated, loginPartner } from '../services/api';

const resolveNextPath = (next: string | null) => next && next.startsWith('/') ? next : '/partner';

export default function PartnerLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const nextPath = useMemo(() => resolveNextPath(new URLSearchParams(location.search).get('next')), [location.search]);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  if (isPartnerAuthenticated()) return <Navigate to={nextPath} replace />;
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setErrorMessage(''); setSubmitting(true); try { await loginPartner({ identifier: identifier.trim(), password }); navigate(nextPath, { replace: true }); } catch (error) { setErrorMessage(getApiErrorMessage(error, t('auth.authFailed'))); } finally { setSubmitting(false); } };
  return <SketchAuthLayout partner title={t('auth.partnerTitle')} description={t('auth.partnerDescriptionLogin')}><div className="sketch-auth-tabs"><button className="is-active">{t('common.login')}</button><button onClick={() => navigate(`/partner/signup?next=${encodeURIComponent(nextPath)}`)}>{t('auth.partnerSignup')}</button></div><div className="sketch-auth-body"><h2>{t('auth.partnerLoginHeader')}</h2><p>{t('auth.partnerLoginSub')}</p><form className="sketch-auth-form" onSubmit={submit}><div className="sketch-field"><label htmlFor="partner-identifier">{t('auth.identifier')}</label><input id="partner-identifier" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required autoComplete="username" placeholder={t('auth.identifierPlaceholder')} /></div><div className="sketch-field"><label htmlFor="partner-password">{t('auth.password')}</label><div className="sketch-password"><input id="partner-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" placeholder="••••••••" /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? t('auth.hide') : t('auth.show')}</button></div></div>{errorMessage && <div className="sketch-auth-error">{errorMessage}</div>}<button className="sketch-btn sketch-btn-tertiary sketch-auth-submit" type="submit" disabled={submitting}>{submitting ? t('auth.loggingIn') : t('auth.enterPortal')}</button></form><Link className="sketch-auth-link" to={`/partner/signup?next=${encodeURIComponent(nextPath)}`}>{t('auth.firstTimePartner')}</Link></div></SketchAuthLayout>;
}
