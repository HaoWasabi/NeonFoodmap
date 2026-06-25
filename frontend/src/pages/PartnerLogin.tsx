import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { getApiErrorMessage, isPartnerAuthenticated, loginPartner } from '../services/api';

const resolveNextPath = (nextParam: string | null): string => {
    if (!nextParam || !nextParam.startsWith('/')) return '/partner';
    return nextParam;
};

export default function PartnerLogin() {
    const navigate = useNavigate();
    const location = useLocation();

    const nextPath = useMemo(() => {
        const search = new URLSearchParams(location.search);
        return resolveNextPath(search.get('next'));
    }, [location.search]);

    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    if (isPartnerAuthenticated()) {
        return <Navigate to={nextPath} replace />;
    }

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setErrorMessage('');
        setSubmitting(true);

        try {
            await loginPartner({ identifier: identifier.trim(), password });
            navigate(nextPath, { replace: true });
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'Đăng nhập thất bại. Vui lòng kiểm tra email/username và mật khẩu.'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-950 px-5 py-8">
            <div className="pointer-events-none absolute -top-16 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-cyan-400/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 right-[-60px] h-64 w-64 rounded-full bg-orange-400/30 blur-3xl" />

            <section className="relative w-full max-w-md rounded-3xl border border-white/15 bg-white/95 p-6 shadow-2xl backdrop-blur">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-700">Góc đối tác</p>
                <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Đăng nhập Partner</h1>
                <p className="mt-2 text-sm text-slate-600">
                    Đăng nhập bằng <span className="font-semibold text-slate-800">email hoặc tên đăng nhập</span> (trùng tài khoản app) và mật khẩu.
                </p>

                <form
                    method="post"
                    action="#"
                    className="mt-6 space-y-4"
                    onSubmit={handleSubmit}
                >
                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Email hoặc tên đăng nhập</span>
                        <input
                            type="text"
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            required
                            autoComplete="username"
                            className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-cyan-500"
                            placeholder="partner@example.com hoặc username"
                        />
                    </label>

                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Mật khẩu</span>
                        <div className="mt-1 flex items-center rounded-2xl border border-slate-200 bg-slate-50 pr-2 focus-within:border-cyan-500">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                autoComplete="current-password"
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
                        {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
                    </button>
                </form>

                <p className="mt-5 text-center text-sm text-slate-600">
                    Lần đầu vào cổng Partner?{' '}
                    <Link
                        to={`/partner/signup?next=${encodeURIComponent(nextPath)}`}
                        className="font-bold text-cyan-700 hover:text-cyan-600"
                    >
                        Kích hoạt bằng tài khoản app
                    </Link>
                </p>

                <button
                    onClick={() => navigate('/settings')}
                    className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 transition hover:bg-slate-100"
                >
                    Quay lại cài đặt
                </button>
            </section>
        </div>
    );
}
