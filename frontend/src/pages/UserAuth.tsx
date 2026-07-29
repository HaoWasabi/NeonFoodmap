import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SketchAuthLayout from '../components/SketchAuthLayout';
import { useApp } from '../context/AppContext';
import {
  getApiErrorMessage,
  getOrCreateDeviceId,
  guestLogin,
  loginUserAccount,
  signupUserAccount,
} from '../services/api';
import { DEFAULT_VOICE_REGION, type User } from '../types';

type AuthMode = 'login' | 'signup';

const guessUsernameFromEmail = (email: string) =>
  email.trim().toLowerCase().split('@')[0] || '';

const userForAppState = (user: User): User => ({
  ...user,
  device_id: user.device_id || getOrCreateDeviceId(),
  preferred_language: user.preferred_language || 'vi',
  preferred_voice_region: DEFAULT_VOICE_REGION,
});

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
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const heading = useMemo(
    () => (mode === 'login' ? t('auth.keepTravels') : t('auth.createAccountSubtitle')),
    [mode, t],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');

    if (mode === 'signup' && password !== confirmPassword) {
      setErrorMessage(t('settings.errorPasswordMismatch'));
      return;
    }

    setSubmitting(true);
    try {
      const session =
        mode === 'login'
          ? await loginUserAccount({ email: email.trim(), password })
          : await signupUserAccount({
              email: email.trim(),
              username: username.trim(),
              password,
              password_confirm: confirmPassword,
            });

      dispatch({ type: 'SET_USER', payload: userForAppState(session.user) });
      navigate('/map', { replace: true });
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, t('auth.authFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGuestContinue = async () => {
    setErrorMessage('');
    setGuestSubmitting(true);

    try {
      const session = await guestLogin(getOrCreateDeviceId());
      dispatch({ type: 'SET_USER', payload: userForAppState(session.user) });
      navigate('/map', { replace: true });
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, t('auth.guestLoginFailed')));
    } finally {
      setGuestSubmitting(false);
    }
  };

  return (
    <SketchAuthLayout title={heading} description={t('auth.syncDescription')}>
      <div className="sketch-auth-tabs">
        <button
          className={mode === 'login' ? 'is-active' : ''}
          onClick={() => setMode('login')}
          type="button"
        >
          {t('common.login')}
        </button>
        <button
          className={mode === 'signup' ? 'is-active' : ''}
          onClick={() => setMode('signup')}
          type="button"
        >
          {t('auth.createAccount')}
        </button>
      </div>

      <div className="sketch-auth-body">
        <h2>{mode === 'login' ? t('auth.welcomeBack') : t('auth.createAccount')}</h2>
        <p>{mode === 'login' ? t('auth.loginSubtitle') : t('auth.signupSubtitle')}</p>

        <form className="sketch-auth-form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="sketch-field">
              <label htmlFor="user-name">{t('auth.username')}</label>
              <input
                autoComplete="username"
                id="user-name"
                onChange={(event) => setUsername(event.target.value)}
                placeholder={t('auth.usernamePlaceholder')}
                required
                value={username}
              />
            </div>
          )}

          <div className="sketch-field">
            <label htmlFor="user-email">{t('auth.email')}</label>
            <input
              autoComplete="email"
              id="user-email"
              onChange={(event) => {
                const value = event.target.value;
                setEmail(value);
                if (!username.trim()) setUsername(guessUsernameFromEmail(value));
              }}
              placeholder={t('auth.emailPlaceholder')}
              required
              type="email"
              value={email}
            />
          </div>

          <div className="sketch-field">
            <label htmlFor="user-password">{t('auth.password')}</label>
            <div className="sketch-password">
              <input
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                id="user-password"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? t('auth.hide') : t('auth.show')}
              </button>
            </div>
          </div>

          {mode === 'signup' && (
            <div className="sketch-field">
              <label htmlFor="user-confirm">{t('auth.confirmPassword')}</label>
              <input
                autoComplete="new-password"
                id="user-confirm"
                minLength={8}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder={t('auth.confirmPasswordPlaceholder')}
                required
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
              />
            </div>
          )}

          {errorMessage && <div className="sketch-auth-error">{errorMessage}</div>}

          <button className="sketch-btn sketch-btn-primary sketch-auth-submit" disabled={submitting} type="submit">
            {submitting ? t('auth.processing') : mode === 'login' ? t('auth.loginNow') : t('auth.createAccountBtn')}
          </button>
        </form>

        <div className="sketch-auth-note">
          <strong>{t('auth.guestContinueTitle')}</strong>
          <span>{t('auth.guestContinueDescription')}</span>
          <button
            className="sketch-btn sketch-btn-outline"
            disabled={submitting || guestSubmitting}
            onClick={() => void handleGuestContinue()}
            type="button"
          >
            {guestSubmitting ? t('auth.processing') : t('auth.continueAsGuest')}
          </button>
        </div>

        <p className="sketch-auth-note">
          {t('auth.partnerNotePrefix')}
          <Link to="/partner/login?next=%2Fpartner">{t('auth.partnerPage')}</Link>.
        </p>
      </div>
    </SketchAuthLayout>
  );
}
