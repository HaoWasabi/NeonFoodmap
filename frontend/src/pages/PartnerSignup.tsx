import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { getApiErrorMessage, isPartnerAuthenticated, signupPartner } from '../services/api';

const resolveNextPath = (nextParam: string | null): string => {
    if (!nextParam || !nextParam.startsWith('/')) return '/partner';
    return nextParam;
};

export default function PartnerSignup() {
    const navigate = useNavigate();
    const location = useLocation();

    const nextPath = useMemo(() => {
        const search = new URLSearchParams(location.search);
        return resolveNextPath(search.get('next'));
    }, [location.search]);

    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [businessName, setBusinessName] = useState('');
    const [address, setAddress] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    if (isPartnerAuthenticated()) {
        return <Navigate to={nextPath} replace />;
    }

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setErrorMessage('');

        if (password !== confirmPassword) {
            setErrorMessage('Mật khẩu xác nhận không khớp.');
            return;
        }

        setSubmitting(true);
        try {
            await signupPartner({
                identifier: identifier.trim(),
                password,
                password_confirm: confirmPassword,
                business_name: businessName.trim(),
                address: address.trim(),
            });
            navigate(nextPath, { replace: true });
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'Đăng ký thất bại. Vui lòng kiểm tra lại thông tin.'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-950 px-5 py-8">
            <div className="pointer-events-none absolute -top-16 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-emerald-400/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 left-[-80px] h-64 w-64 rounded-full bg-amber-400/30 blur-3xl" />

            <section className="relative w-full max-w-md rounded-3xl border border-white/15 bg-white/95 p-6 shadow-2xl backdrop-blur">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Góc đối tác</p>
                <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Đăng ký Partner</h1>
                <p className="mt-2 text-sm text-slate-600">
                    Bạn cần đã có <span className="font-semibold text-slate-800">tài khoản người dùng app</span>. Nhập{' '}
                    <span className="font-semibold text-slate-800">email hoặc tên đăng nhập</span> và đúng mật khẩu app để xác thực, sau đó điền{' '}
                    <span className="font-semibold text-slate-800">thông tin cơ sở</span> để tạo hồ sơ đối tác.
                </p>

                <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Xác thực tài khoản app</p>

                        <label className="mt-3 block">
                            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Email hoặc tên đăng nhập</span>
                            <input
                                type="text"
                                value={identifier}
                                onChange={(e) => setIdentifier(e.target.value)}
                                required
                                autoComplete="username"
                                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-emerald-500"
                                placeholder="partner@example.com hoặc username"
                            />
                        </label>

                        <label className="mt-3 block">
                            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Mật khẩu</span>
                            <div className="mt-1 flex items-center rounded-2xl border border-slate-200 bg-white pr-2 focus-within:border-emerald-500">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    autoComplete="current-password"
                                    className="w-full rounded-2xl bg-transparent px-4 py-3 text-sm text-slate-800 outline-none"
                                    placeholder="Mật khẩu tài khoản app"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((prev) => !prev)}
                                    className="rounded-xl px-3 py-1.5 text-xs font-bold text-slate-500 transition hover:bg-slate-100"
                                >
                                    {showPassword ? 'Ẩn' : 'Hiện'}
                                </button>
                            </div>
                        </label>

                        <label className="mt-3 block">
                            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Xác nhận mật khẩu</span>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                autoComplete="current-password"
                                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-emerald-500"
                                placeholder="Nhập lại mật khẩu"
                            />
                        </label>
                    </div>

                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Hồ sơ đối tác</p>

                        <label className="mt-3 block">
                            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Tên cơ sở / quán</span>
                            <input
                                type="text"
                                value={businessName}
                                onChange={(e) => setBusinessName(e.target.value)}
                                required
                                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-emerald-500"
                                placeholder="VD: Quán phở Vĩnh Khánh"
                            />
                        </label>

                        <label className="mt-3 block">
                            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Địa chỉ</span>
                            <input
                                type="text"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-emerald-500"
                                placeholder="Số nhà, đường, quận..."
                            />
                        </label>
                    </div>

                    {errorMessage && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                            {errorMessage}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={submitting || !businessName.trim()}
                        className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {submitting ? 'Đang tạo hồ sơ...' : 'Tạo hồ sơ Partner'}
                    </button>
                </form>

                <p className="mt-5 text-center text-sm text-slate-600">
                    Chưa có tài khoản app?{' '}
                    <Link to="/login" className="font-bold text-emerald-700 hover:text-emerald-600">
                        Đăng ký người dùng
                    </Link>
                </p>
                <p className="mt-2 text-center text-sm text-slate-600">
                    Đã có hồ sơ Partner?{' '}
                    <Link
                        to={`/partner/login?next=${encodeURIComponent(nextPath)}`}
                        className="font-bold text-emerald-700 hover:text-emerald-600"
                    >
                        Đăng nhập Partner
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
