import { useState } from 'react';
import { createPortal } from 'react-dom';
import { PayPalButtons } from '@paypal/react-paypal-js';
import { useTranslation } from 'react-i18next';
import type { Tour } from '../types';
import {
    purchasePremiumTour,
    paypalCreateOrder,
    paypalCaptureOrder,
    getApiErrorMessage,
} from '../services/api';

interface PremiumTourCheckoutProps {
    tour: Tour;
    onClose: () => void;
    onSuccess: () => void;
}

export default function PremiumTourCheckout({ tour, onClose, onSuccess }: PremiumTourCheckoutProps) {
    const { t, i18n } = useTranslation();
    const [invoiceId, setInvoiceId] = useState<string>('');
    const [paying, setPaying] = useState(false);
    const [error, setError] = useState('');
    const [step, setStep] = useState<'confirm' | 'pay' | 'done'>('confirm');

    const tourName = tour.translated_name?.[i18n.language] || tour.name;

    const handleStartPurchase = async () => {
        setError('');
        setPaying(true);
        try {
            const result = await purchasePremiumTour(tour.id);
            setInvoiceId(result.invoice_id);
            setStep('pay');
        } catch (e) {
            let msg = getApiErrorMessage(e);
            if (msg.includes('Authentication credentials were not provided')) {
                msg = t('tour.authRequired', { defaultValue: 'Hãy liên kết tài khoản để mở khóa.' });
            }
            setError(msg);
        } finally {
            setPaying(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl animate-modal-in max-h-[90dvh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                        <div className="size-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                            <span className="material-symbols-outlined text-white text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
                                workspace_premium
                            </span>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">Premium Tour</p>
                            <p className="text-sm font-bold text-slate-900">{tourName}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="size-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
                    >
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                </div>

                {step === 'confirm' && (
                    <div className="space-y-4">
                        {/* Tour Info */}
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="material-symbols-outlined text-amber-500 text-base" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                                <p className="text-xs font-bold text-slate-600">
                                    {t('tour.premiumFeatures', { defaultValue: 'Tính năng Premium' })}
                                </p>
                            </div>
                            <ul className="space-y-1.5 text-xs text-slate-500">
                                <li className="flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-emerald-500 text-[14px]">check_circle</span>
                                    {t('tour.premiumAudio', { defaultValue: 'Audio thuyết minh chuyên nghiệp' })}
                                </li>
                                <li className="flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-emerald-500 text-[14px]">check_circle</span>
                                    {t('tour.premiumGuide', { defaultValue: 'Hướng dẫn viên chuyên gia' })}
                                </li>
                                <li className="flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-emerald-500 text-[14px]">check_circle</span>
                                    {t('tour.premiumUnlimited', { defaultValue: 'Truy cập không giới hạn' })}
                                </li>
                            </ul>
                        </div>

                        {/* Price */}
                        <div className="flex items-center justify-between px-1">
                            <p className="text-sm font-medium text-slate-500">
                                {t('tour.premiumPrice', { defaultValue: 'Phí mở khóa' })}
                            </p>
                            <p className="text-2xl font-black text-slate-900">
                                {(tour.premium_price || 0).toLocaleString('vi-VN')}₫
                            </p>
                        </div>

                        {/* CTA */}
                        <button
                            onClick={handleStartPurchase}
                            disabled={paying}
                            className="w-full h-14 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-base shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 tap-scale disabled:opacity-60 disabled:pointer-events-none transition-all"
                        >
                            {paying ? (
                                <div className="size-5 rounded-full border-[2px] border-white border-t-transparent animate-spin" />
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>lock_open</span>
                                    {t('tour.unlockNow', { defaultValue: 'Mở khóa ngay' })}
                                </>
                            )}
                        </button>
                    </div>
                )}

                {step === 'pay' && invoiceId && (
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center">
                            <p className="text-sm font-bold text-slate-700 mb-1">
                                {t('tour.payWithPaypal', { defaultValue: 'Thanh toán qua PayPal' })}
                            </p>
                            <p className="text-2xl font-black text-slate-900">
                                {(tour.premium_price || 0).toLocaleString('vi-VN')}₫
                            </p>
                        </div>

                        <div className={`rounded-2xl border ${paying ? 'border-slate-200 opacity-60 pointer-events-none' : 'border-slate-100'} p-2 bg-white`}>
                            <PayPalButtons
                                disabled={paying}
                                style={{ layout: 'vertical', shape: 'pill', label: 'pay' }}
                                createOrder={async () => {
                                    setError('');
                                    const orderId = await paypalCreateOrder(invoiceId);
                                    return orderId;
                                }}
                                onApprove={async (data: { orderID?: string }) => {
                                    try {
                                        setPaying(true);
                                        setError('');
                                        await paypalCaptureOrder(String(data.orderID || ''), invoiceId);
                                        setStep('done');
                                        onSuccess();
                                    } catch (e) {
                                        setError(getApiErrorMessage(e));
                                    } finally {
                                        setPaying(false);
                                    }
                                }}
                                onError={(err: unknown) => {
                                    console.error(err);
                                    setError(t('tour.paypalError', { defaultValue: 'Không thể khởi tạo PayPal. Vui lòng thử lại.' }));
                                }}
                            />
                        </div>
                    </div>
                )}

                {step === 'done' && (
                    <div className="text-center py-4 space-y-4">
                        <div className="size-16 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center mx-auto animate-bounce-in">
                            <span className="material-symbols-outlined text-emerald-500 text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                                check_circle
                            </span>
                        </div>
                        <div>
                            <p className="text-lg font-bold text-slate-900">
                                {t('tour.purchaseSuccess', { defaultValue: 'Mở khóa thành công!' })}
                            </p>
                            <p className="text-sm text-slate-500 mt-1">
                                {t('tour.purchaseSuccessDesc', { defaultValue: 'Bạn có thể bắt đầu tour premium ngay bây giờ.' })}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-full h-12 rounded-2xl bg-primary text-white font-bold text-sm shadow-lg tap-scale"
                        >
                            {t('tour.startTour', { defaultValue: 'Bắt đầu Tour' })}
                        </button>
                    </div>
                )}

                {error && (
                    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 font-semibold">
                        {error}
                    </div>
                )}
            </div>
        </div>
    , document.body);
}
