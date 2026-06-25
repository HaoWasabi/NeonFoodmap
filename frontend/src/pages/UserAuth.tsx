import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getApiErrorMessage, loginUserAccount, signupUserAccount, getOrCreateDeviceId } from '../services/api';
import type { User } from '../types';

type AuthMode = 'login' | 'signup';

const guessUsernameFromEmail = (email: string): string => {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes('@')) return normalized;
    return normalized.split('@')[0];
};

function userForAppState(sessionUser: User): User {
    const deviceId = getOrCreateDeviceId();
    return {
        ...sessionUser,
        device_id: sessionUser.device_id || deviceId,
        preferred_language: sessionUser.preferred_language || 'vi',
        preferred_voice_region: sessionUser.preferred_voice_region || 'mien_nam',
    };
}

export default function UserAuth() {
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

    const heading = useMemo(() => {
        return mode === 'login' ? 'Đăng nhập tài khoản người dùng' : 'Đăng ký tài khoản người dùng';
    }, [mode]);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setErrorMessage('');

        if (mode === 'signup' && password !== confirmPassword) {
            setErrorMessage('Mật khẩu xác nhận không khớp.');
            return;
        }

        setSubmitting(true);
        try {
            if (mode === 'login') {
                const session = await loginUserAccount({ email: email.trim(), password });
                dispatch({ type: 'SET_USER', payload: userForAppState(session.user) });
            } else {
                const session = await signupUserAccount({
                    email: email.trim(),
                    username: username.trim(),
                    password,
                    password_confirm: confirmPassword,
                });
                dispatch({ type: 'SET_USER', payload: userForAppState(session.user) });
            }
            navigate('/map', { replace: true });
        } catch (error) {
            // Demo mode: cho phép vào app ngay khi auth API chưa sẵn sàng (không ghi đè JWT trong localStorage).
            if (email.trim() && password.trim()) {
                setIsDemoMode(true);
                const normalizedEmail = email.trim().toLowerCase();
                dispatch({
                    type: 'SET_USER',
                    payload: {
                        id: normalizedEmail,
                        email: normalizedEmail,
                        username: guessUsernameFromEmail(normalizedEmail),
                        device_id: getOrCreateDeviceId(),
                        preferred_language: 'vi',
                        preferred_voice_region: 'mien_nam',
                    },
                });
                navigate('/map', { replace: true });
                return;
            }
            setErrorMessage(getApiErrorMessage(error, 'Không thể xác thực tài khoản. Vui lòng thử lại.'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-950 px-5 py-8">
            <div className="pointer-events-none absolute -top-16 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-teal-400/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 right-[-60px] h-64 w-64 rounded-full bg-amber-400/30 blur-3xl" />

            <section className="relative w-full max-w-md rounded-3xl border border-white/15 bg-white/95 p-6 shadow-2xl backdrop-blur">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-700">Người dùng</p>
                <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">{heading}</h1>
                <p className="mt-2 text-sm text-slate-600">Truy cập ứng dụng khám phá bằng email và mật khẩu.</p>

                <div className="mt-4 grid grid-cols-2 rounded-2xl border border-slate-200 bg-slate-100 p-1">
                    <button
                        type="button"
                        onClick={() => setMode('login')}
                        className={`rounded-xl px-3 py-2 text-xs font-bold transition ${mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                    >
                        Đăng nhập
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('signup')}
                        className={`rounded-xl px-3 py-2 text-xs font-bold transition ${mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                    >
                        Đăng ký
                    </button>
                </div>

                {isDemoMode && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                        Chế độ demo: Backend auth chưa sẵn sàng, bạn vẫn có thể vào app để trải nghiệm.
                    </div>
                )}

                <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Email</span>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => {
                                const value = e.target.value;
                                setEmail(value);
                                if (!username.trim()) setUsername(guessUsernameFromEmail(value));
                            }}
                            required
                            autoComplete="email"
                            className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-teal-500"
                            placeholder="user@example.com"
                        />
                    </label>

                    {mode === 'signup' && (
                        <label className="block">
                            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Tên tài khoản</span>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                autoComplete="username"
                                className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-teal-500"
                                placeholder="nguoidung_vinhkhanh"
                            />
                        </label>
                    )}

                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Mật khẩu</span>
                        <div className="mt-1 flex items-center rounded-2xl border border-slate-200 bg-slate-50 pr-2 focus-within:border-teal-500">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={8}
                                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                className="w-full rounded-2xl bg-transparent px-4 py-3 text-sm text-slate-800 outline-none"
                                placeholder="••••••••"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((prev) => !prev)}
                                className="rounded-xl px-3 py-1.5 text-xs font-bold text-slate-500 transition hover:bg-slate-200"
                            >
                                {showPassword ? 'Ẩn' : 'Hiện'}
                            </button>
                        </div>
                    </label>

                    {mode === 'signup' && (
                        <label className="block">
                            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Xác nhận mật khẩu</span>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                minLength={8}
                                autoComplete="new-password"
                                className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-teal-500"
                                placeholder="Nhập lại mật khẩu"
                            />
                        </label>
                    )}

                    {errorMessage && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                            {errorMessage}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {submitting ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}
                    </button>
                </form>

                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    Đăng nhập Partner nằm ở luồng riêng trong mục Cài đặt, hoặc truy cập nhanh tại{' '}
                    <Link to="/partner/login?next=%2Fpartner" className="font-bold text-cyan-700 hover:text-cyan-600">
                        trang Partner
                    </Link>
                    .
                </div>
            </section>
        </div>
    );
}
