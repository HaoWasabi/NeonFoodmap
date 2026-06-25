import { useState } from 'react';
import { createPortal } from 'react-dom';
import { upgradeGuestAccount, loginUserAccount, getApiErrorMessage } from '../services/api';
import { useApp } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

interface AccountUpgradeModalProps {
    onClose: () => void;
}

type ModalMode = 'upgrade' | 'login';

export default function AccountUpgradeModal({ onClose }: AccountUpgradeModalProps) {
    const { t } = useTranslation();
    const { dispatch } = useApp();
    const [mode, setMode] = useState<ModalMode>('upgrade');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (mode === 'upgrade' && password !== passwordConfirm) {
            setError(t('settings.errorPasswordMismatch'));
            return;
        }

        setLoading(true);
        try {
            const session = mode === 'upgrade' 
                ? await upgradeGuestAccount({ email, password, password_confirm: passwordConfirm })
                : await loginUserAccount({ email, password });
            
            dispatch({ type: 'SET_USER', payload: session.user });
            
            // Clear offline state and reload to force a fresh network sync for the new user
            localStorage.setItem('bcsd_offline_mode', 'false');
            localStorage.removeItem('bcsd_sync_queue');
            
            setSuccess(true);
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } catch (err: unknown) {
            // Existing email -> guide user to login mode instead of showing generic error.
            if (axios.isAxiosError(err)) {
                const status = err.response?.status;
                const data = err.response?.data as { code?: string; error?: string } | undefined;
                if (status === 409 && data?.code === 'EMAIL_EXISTS') {
                    setMode('login');
                    setPassword('');
                    setPasswordConfirm('');
                    setError(data.error || t('common.alreadyHaveAccount'));
                    setLoading(false);
                    return;
                }
            }
            setError(getApiErrorMessage(err, t('settings.errorGeneral')));
            setLoading(false);
        }
    };

    const toggleMode = () => {
        setMode(prev => prev === 'upgrade' ? 'login' : 'upgrade');
        setError('');
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={!loading ? onClose : undefined} />
            <div className="relative w-full max-w-[400px] rounded-3xl bg-white p-6 shadow-2xl animate-pop-in">
                <button
                    onClick={onClose}
                    className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                    disabled={loading}
                >
                    <span className="material-symbols-outlined text-lg">close</span>
                </button>

                <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                        {mode === 'upgrade' ? 'admin_panel_settings' : 'login'}
                    </span>
                </div>

                <h3 className="text-center text-xl font-bold text-slate-900">
                    {mode === 'upgrade' ? t('settings.upgradeTitle') : t('common.loginAccount')}
                </h3>
                <p className="mt-2 text-center text-sm text-slate-500">
                    {mode === 'upgrade' ? t('settings.upgradeDescription') : t('common.loginDescription')}
                </p>

                {success ? (
                    <div className="mt-6 flex flex-col items-center gap-3 py-4">
                        <div className="flex size-12 items-center justify-center rounded-full bg-green-100 text-green-600">
                            <span className="material-symbols-outlined text-3xl">check</span>
                        </div>
                        <p className="font-bold text-green-600">
                            {mode === 'upgrade' ? t('settings.upgradeSuccess') : t('common.loginSuccess')}
                        </p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                        <div>
                            <label className="mb-1 block text-xs font-bold text-slate-700">Email</label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                                placeholder={t('settings.emailPlaceholder')}
                                disabled={loading}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-bold text-slate-700">{t('settings.password')}</label>
                            <input
                                type="password"
                                required
                                minLength={8}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                                placeholder={mode === 'upgrade' ? t('settings.passwordMinChars') : t('common.passwordPlaceholder')}
                                disabled={loading}
                            />
                        </div>
                        
                        {mode === 'upgrade' && (
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-700">{t('settings.passwordConfirm')}</label>
                                <input
                                    type="password"
                                    required
                                    minLength={8}
                                    value={passwordConfirm}
                                    onChange={(e) => setPasswordConfirm(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                                    placeholder={t('settings.passwordConfirmPlaceholder')}
                                    disabled={loading}
                                />
                            </div>
                        )}

                        {error && <p className="text-center text-xs font-medium text-rose-500">{error}</p>}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full rounded-2xl bg-primary py-3.5 text-sm font-bold text-white shadow-lg shadow-primary/30 transition tap-scale disabled:opacity-70 flex justify-center mt-2"
                        >
                            {loading ? (
                                <span className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                mode === 'upgrade' ? t('settings.complete') : t('common.login')
                            )}
                        </button>

                        <div className="text-center mt-4">
                            <button
                                type="button"
                                onClick={toggleMode}
                                className="text-xs font-bold text-slate-500 hover:text-primary transition"
                                disabled={loading}
                            >
                                {mode === 'upgrade' 
                                    ? t('common.alreadyHaveAccount') 
                                    : t('common.donthaveAccount')}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>,
        document.body
    );
}
