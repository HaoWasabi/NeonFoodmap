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
    const price = (tour.premium_price || 50000).toLocaleString('vi-VN');

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
        <div className="scrim is-visible" onClick={onClose} style={{ zIndex: 9999 }}>
            <section className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-head">
                    <h2 id="checkoutTitle">{t('checkout.unlockTourTitle')}</h2>
                    <button className="sketch-icon-button" onClick={onClose} aria-label={t('common.close')}>×</button>
                </div>
                <div className="checkout-body">
                    <span className="sketch-chip sketch-chip-tertiary">{t('tour.premium')}</span>
                    <h3 className="plan-title" style={{ fontSize: '1.8rem', margin: '14px 0 8px' }}>{tourName}</h3>
                    <p style={{ color: 'var(--sk-muted)', fontSize: '.84rem', lineHeight: 1.5, margin: 0 }}>
                        {t('checkout.unlockDescription')}
                    </p>

                    <div className="checkout-summary">
                        <div className="checkout-row">
                            <span>{t('checkout.unlockContent')}</span>
                            <strong>{String(tour.pois?.length || 0).padStart(2, '0')} {t('tour.stopsUppercase')}</strong>
                        </div>
                        <div className="checkout-row">
                            <span>{t('checkout.duration')}</span>
                            <strong>{t('checkout.forever')}</strong>
                        </div>
                    </div>

                    <div className="checkout-total">
                        <span>{t('checkout.totalPayment')}</span>
                        <strong>{price} VND</strong>
                    </div>

                    {step === 'confirm' && (
                        <button
                            onClick={handleStartPurchase}
                            disabled={paying}
                            className="sketch-btn sketch-btn-tertiary plan-primary"
                            style={{ width: '100%', minHeight: '48px' }}
                        >
                            {paying ? t('checkout.initializing') : t('checkout.continuePaypal')}
                        </button>
                    )}

                    {step === 'pay' && invoiceId && (
                        <div style={{ marginTop: 12 }}>
                            <PayPalButtons
                                disabled={paying}
                                style={{ layout: 'vertical', shape: 'rect', label: 'pay' }}
                                createOrder={async () => {
                                    setError('');
                                    return await paypalCreateOrder(invoiceId);
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
                    )}

                    {step === 'done' && (
                        <div style={{ textAlign: 'center', padding: '16px 0' }}>
                            <strong style={{ display: 'block', fontSize: '1.2rem', color: 'var(--sk-primary)', marginBottom: 6 }}>
                                {t('checkout.unlockSuccess')}
                            </strong>
                            <p style={{ fontSize: '.8rem', color: 'var(--sk-muted)', margin: 0 }}>
                                {t('checkout.unlockSuccessDesc')}
                            </p>
                            <button className="sketch-btn sketch-btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={onClose}>
                                {t('checkout.startTourBtn')}
                            </button>
                        </div>
                    )}

                    {error && (
                        <div style={{ marginTop: 12, padding: 10, border: '1px solid var(--sk-danger)', background: '#f7e9e6', color: 'var(--sk-danger)', fontSize: '.75rem' }}>
                            {error}
                        </div>
                    )}

                    <p className="modal-note">{t('checkout.securePayment')}</p>
                </div>
            </section>
        </div>,
        document.body
    );
}
