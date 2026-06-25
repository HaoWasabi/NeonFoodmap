import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PayPalButtons } from '@paypal/react-paypal-js';
import AppLayout from '../components/AppLayout';
import { getApiErrorMessage, getInvoiceById, getInvoices, paypalCaptureOrder, paypalCreateOrder } from '../services/api';
import type { Invoice } from '../services/api';

export default function InvoiceDetail() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const invoiceId = params.get('invoiceId') || '';

    const [invoice, setInvoice] = useState<Invoice | null>(null);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [paying, setPaying] = useState(false);
    const [error, setError] = useState<string>('');

    useEffect(() => {
        let alive = true;

        async function load() {
            try {
                setLoading(true);
                setError('');

                if (invoiceId) {
                    const data = await getInvoiceById(invoiceId);
                    if (!alive) return;
                    setInvoice(data);
                    return;
                }

                // Lấy danh sách hóa đơn thay vì tạo mới
                const invoicesList = await getInvoices();
                if (!alive) return;
                setInvoices(invoicesList);
                
                // Nếu có hóa đơn, chọn hóa đơn đầu tiên để hiển thị
                if (invoicesList.length > 0) {
                    setInvoice(invoicesList[0]);
                    setParams({ invoiceId: invoicesList[0].id }, { replace: true });
                }
            } catch (e) {
                if (!alive) return;
                setError(getApiErrorMessage(e));
            } finally {
                if (!alive) return;
                setLoading(false);
            }
        }

        load();
        return () => {
            alive = false;
        };
    }, [invoiceId, navigate]);

    const statusBadge = (status?: string) => {
        if (status === 'SUCCESS') return 'bg-green-50 text-green-700 border-green-200';
        if (status === 'PENDING') return 'bg-amber-50 text-amber-700 border-amber-200';
        if (status === 'CANCELLED') return 'bg-slate-50 text-slate-600 border-slate-200';
        return 'bg-rose-50 text-rose-700 border-rose-200';
    };

    return (
        <AppLayout title="Hóa đơn" showBack backPath="/settings">
            <div className="mx-4 mt-4">
                {/* Danh sách hóa đơn */}
                {invoices.length > 0 && (
                    <div className="mb-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-2">Danh sách hóa đơn</h3>
                        <div className="space-y-2">
                            {invoices.map((inv) => (
                                <div
                                    key={inv.id}
                                    onClick={() => {
                                        setInvoice(inv);
                                        setParams({ invoiceId: inv.id }, { replace: true });
                                    }}
                                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                        invoice?.id === inv.id
                                            ? 'border-primary bg-primary/5'
                                            : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                                >
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <p className="text-xs text-slate-500">{inv.created_at}</p>
                                            <p className="text-sm font-semibold">{inv.amount.toLocaleString('vi-VN')}₫</p>
                                        </div>
                                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${statusBadge(inv.status)}`}>
                                            {inv.status}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Chi tiết hóa đơn */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                    {loading ? (
                        <div className="space-y-3">
                            <div className="h-4 w-2/3 skeleton" />
                            <div className="h-4 w-1/2 skeleton" />
                            <div className="h-10 w-full skeleton" />
                        </div>
                    ) : invoice ? (
                        <div className="space-y-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs text-slate-400 font-semibold">Lý do thanh toán</p>
                                    <p className="text-sm font-bold text-slate-900 mt-1">{invoice.reason}</p>
                                </div>
                                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${statusBadge(invoice.status)}`}
                                >
                                    {invoice.status}
                                </span>
                            </div>

                            <div>
                                <p className="text-xs text-slate-400 font-semibold">Số tiền</p>
                                <p className="text-2xl font-black text-slate-900 mt-1">
                                    {invoice.amount.toLocaleString('vi-VN')}₫
                                </p>
                            </div>

                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500">Mã giao dịch</span>
                                    <span className="text-slate-700 font-mono">{invoice.transaction_code || '—'}</span>
                                </div>
                                <div className="flex justify-between text-xs mt-2">
                                    <span className="text-slate-500">Thanh toán lúc</span>
                                    <span className="text-slate-700">{invoice.paid_at ? new Date(invoice.paid_at).toLocaleString('vi-VN') : '—'}</span>
                                </div>
                            </div>

                            {invoice.status === 'SUCCESS' ? (
                                <button
                                    disabled
                                    className="w-full py-4 rounded-2xl font-bold text-base bg-slate-200 text-slate-500"
                                >
                                    Đã thanh toán
                                </button>
                            ) : (
                                <div className="w-full">
                                    <div className={`rounded-2xl border ${paying ? 'border-slate-200 opacity-60 pointer-events-none' : 'border-slate-100'} p-2 bg-white`}>
                                        <PayPalButtons
                                            disabled={paying}
                                            style={{ layout: 'vertical', shape: 'pill', label: 'pay' }}
                                            createOrder={async () => {
                                                if (!invoice) throw new Error('Missing invoice');
                                                setError('');
                                                const orderId = await paypalCreateOrder(invoice.id);
                                                return orderId;
                                            }}
                                            onApprove={async (data: { orderID?: string }) => {
                                                if (!invoice) return;
                                                try {
                                                    setPaying(true);
                                                    setError('');
                                                    await paypalCaptureOrder(String(data.orderID || ''), invoice.id);
                                                    const refreshed = await getInvoiceById(invoice.id);
                                                    setInvoice(refreshed);
                                                } catch (e) {
                                                    setError(getApiErrorMessage(e));
                                                } finally {
                                                    setPaying(false);
                                                }
                                            }}
                                            onError={(err: unknown) => {
                                                console.error(err);
                                                setError('Không thể khởi tạo PayPal. Vui lòng thử lại.');
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            {error && (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 font-semibold">
                                    {error}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="text-sm text-slate-600">Không tìm thấy hóa đơn.</div>
                            {error && (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 font-semibold">
                                    {error}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}
