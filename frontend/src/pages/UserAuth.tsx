import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SketchAuthLayout from '../components/SketchAuthLayout';
import { useApp } from '../context/AppContext';
import { getApiErrorMessage, getOrCreateDeviceId, loginUserAccount, signupUserAccount } from '../services/api';
import type { User } from '../types';

type AuthMode = 'login' | 'signup';
const guessUsernameFromEmail = (email: string) => email.trim().toLowerCase().split('@')[0] || '';
const userForAppState = (user: User): User => ({ ...user, device_id: user.device_id || getOrCreateDeviceId(), preferred_language: user.preferred_language || 'vi', preferred_voice_region: user.preferred_voice_region || 'mien_nam' });

export default function UserAuth() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { dispatch } = useApp();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const heading = useMemo(() => mode === 'login' ? t('auth.keepTravels') : t('auth.createAccountSubtitle'), [mode, t]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setErrorMessage('');
    if (mode === 'signup' && password !== confirmPassword) { setErrorMessage(t('settings.errorPasswordMismatch')); return; }
    setSubmitting(true);
    try {
      const session = mode === 'login' ? await loginUserAccount({ email: email.trim(), password }) : await signupUserAccount({ email: email.trim(), username: username.trim(), password, password_confirm: confirmPassword });
      dispatch({ type: 'SET_USER', payload: userForAppState(session.user) }); navigate('/map', { replace: true });
    } catch (error) {
      if (email.trim() && password.trim()) { const normalized = email.trim().toLowerCase(); setIsDemoMode(true); dispatch({ type: 'SET_USER', payload: { id: normalized, email: normalized, username: guessUsernameFromEmail(normalized), device_id: getOrCreateDeviceId(), preferred_language: 'vi', preferred_voice_region: 'mien_nam' } }); navigate('/map', { replace: true }); return; }
      setErrorMessage(getApiErrorMessage(error, t('auth.authFailed')));
    } finally { setSubmitting(false); }
  };

  return <SketchAuthLayout title={heading} description={t('auth.syncDescription')}><div className="sketch-auth-tabs"><button className={mode === 'login' ? 'is-active' : ''} onClick={() => setMode('login')}>{t('common.login')}</button><button className={mode === 'signup' ? 'is-active' : ''} onClick={() => setMode('signup')}>{t('auth.createAccount')}</button></div><div className="sketch-auth-body"><h2>{mode === 'login' ? t('auth.welcomeBack') : t('auth.createAccount')}</h2><p>{mode === 'login' ? t('auth.loginSubtitle') : t('auth.signupSubtitle')}</p>{isDemoMode && <div className="sketch-auth-error">{t('auth.demoNotice')}</div>}<form className="sketch-auth-form" onSubmit={handleSubmit}>{mode === 'signup' && <div className="sketch-field"><label htmlFor="user-name">{t('auth.username')}</label><input id="user-name" value={username} onChange={(event) => setUsername(event.target.value)} required autoComplete="username" placeholder={t('auth.usernamePlaceholder')} /></div>}<div className="sketch-field"><label htmlFor="user-email">{t('auth.email')}</label><input id="user-email" type="email" value={email} onChange={(event) => { const value = event.target.value; setEmail(value); if (!username.trim()) setUsername(guessUsernameFromEmail(value)); }} required autoComplete="email" placeholder={t('auth.emailPlaceholder')} /></div><div className="sketch-field"><label htmlFor="user-password">{t('auth.password')}</label><div className="sketch-password"><input id="user-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="••••••••" /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? t('auth.hide') : t('auth.show')}</button></div></div>{mode === 'signup' && <div className="sketch-field"><label htmlFor="user-confirm">{t('auth.confirmPassword')}</label><input id="user-confirm" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} autoComplete="new-password" placeholder={t('auth.confirmPasswordPlaceholder')} /></div>}{errorMessage && <div className="sketch-auth-error">{errorMessage}</div>}<button className="sketch-btn sketch-btn-primary sketch-auth-submit" type="submit" disabled={submitting}>{submitting ? t('auth.processing') : mode === 'login' ? t('auth.loginNow') : t('auth.createAccountBtn')}</button></form><p className="sketch-auth-note">{t('auth.partnerNotePrefix')}<Link to="/partner/login?next=%2Fpartner">{t('auth.partnerPage')}</Link>.</p></div></SketchAuthLayout>;
}
