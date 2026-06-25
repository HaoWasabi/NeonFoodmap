import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import { getApiErrorMessage, getInvoiceById } from '../services/api';
import type { Invoice } from '../services/api';

export default function PaymentComplete() {
    const navigate = useNavigate();
    const [params] = useSearchParams();

    const invoiceId = params.get('invoiceId') || '';
    const status = params.get('status') || '';
    const orderId = params.get('orderId') || '';
    const code = params.get('code') || '';

    const [invoice, setInvoice] = useState<Invoice | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let alive = true;

        async function load() {
            try {
                setError('');
                if (!invoiceId) return;
                const data = await getInvoiceById(invoiceId);
                if (!alive) return;
                setInvoice(data);
            } catch (e) {
                if (!alive) return;
                setError(getApiErrorMessage(e));
            }
        }

        load();
        return () => {
            alive = false;
        };
    }, [invoiceId]);

    const isSuccess = status === 'success' && code === '00';

    return (
        <AppLayout title="Thanh toán hoàn tất" showBack={false} hideNav>
            <div className="mx-4 mt-6">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                    <div className="flex items-start gap-3">
                        <div className={`size-11 rounded-full flex items-center justify-center ${isSuccess ? 'bg-green-50 text-green-600' : 'bg-rose-50 text-rose-600'}`}>
                            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                                {isSuccess ? 'check_circle' : 'error'}
                            </span>
                        </div>
                        <div className="flex-1">
                            <h2 className="text-base font-black text-slate-900">
                                {isSuccess ? 'Thanh toán thành công' : 'Thanh toán chưa hoàn tất'}
                            </h2>
                            <p className="text-xs text-slate-500 mt-1">
                                {isSuccess
                                    ? 'Cảm ơn bạn! Giao dịch đã được ghi nhận.'
                                    : 'Bạn có thể quay lại hóa đơn để thử thanh toán lại.'}
                            </p>
                        </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2">
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Mã đơn</span>
                            <span className="text-slate-700 font-mono">{orderId || '—'}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Mã phản hồi</span>
                            <span className="text-slate-700 font-mono">{code || '—'}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Trạng thái</span>
                            <span className="text-slate-700 font-semibold">{status || '—'}</span>
                        </div>
                        {invoice && (
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Số tiền</span>
                                <span className="text-slate-900 font-black">{invoice.amount.toLocaleString('vi-VN')}₫</span>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 font-semibold">
                            {error}
                        </div>
                    )}

                    <div className="mt-5 grid grid-cols-2 gap-3">
                        <button
                            onClick={() => navigate('/settings', { replace: true })}
                            className="w-full rounded-2xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 tap-scale transition hover:bg-slate-50"
                        >
                            Về Settings
                        </button>
                        <button
                            onClick={() => navigate(invoiceId ? `/invoice?invoiceId=${invoiceId}` : '/invoice', { replace: true })}
                            className="w-full rounded-2xl bg-primary py-3 text-sm font-bold text-white shadow-primary/20 shadow-lg tap-scale transition hover:shadow-xl"
                        >
                            Xem hóa đơn
                        </button>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
