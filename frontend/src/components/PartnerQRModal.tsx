import { useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { Partner } from '../types';

interface PartnerQRModalProps {
    partner: Partner;
    onClose: () => void;
}

export default function PartnerQRModal({ partner, onClose }: PartnerQRModalProps) {
    // Đóng khi nhấn Escape
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    // Nếu chưa cấu hình qr_url, dùng deep-link dựa trên partner ID để vẫn có QR demo
    const isDemo = !partner.qr_url?.trim();
    const qrValue = partner.qr_url?.trim()
        || `${window.location.origin}/partner/${partner.id}`;
    const mustTry = partner.menu_details?.must_try?.slice(0, 3) ?? [];

    return (
        /* Backdrop */
        <div
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
            onClick={onClose}
        >
            {/* Dark overlay */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Sheet */}
            <div
                className="relative w-full sm:max-w-xs mx-auto bg-white rounded-t-[32px] sm:rounded-3xl shadow-2xl overflow-hidden animate-slide-up"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Handle bar */}
                <div className="flex justify-center pt-3 pb-1 sm:hidden">
                    <div className="w-10 h-1.5 rounded-full bg-slate-200" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                    <div>
                        <p className="text-[10px] font-semibold text-primary uppercase tracking-widest">Đối tác</p>
                        <h2 className="text-lg font-bold text-slate-900 leading-tight">{partner.business_name}</h2>
                        {partner.opening_hours && (
                            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[12px]">schedule</span>
                                {partner.opening_hours}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>

                {/* QR Code */}
                <div className="flex flex-col items-center px-5 py-4">
                    <div className="p-4 bg-white rounded-2xl shadow-[0_0_0_1px_rgba(0,0,0,.06),0_4px_24px_rgba(0,0,0,.1)]">
                        <QRCodeSVG
                            value={qrValue}
                            size={180}
                            bgColor="#ffffff"
                            fgColor="#0f172a"
                            level="M"
                            includeMargin={false}
                        />
                    </div>
                    {isDemo ? (
                        <p className="mt-3 text-[11px] text-amber-500 font-semibold text-center flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px]">info</span>
                            Demo QR · Quán chưa cấu hình link
                        </p>
                    ) : (
                        <p className="mt-3 text-[11px] text-slate-400 text-center max-w-[200px] leading-relaxed">
                            Quét QR để mở menu / đặt chỗ / nhận ưu đãi
                        </p>
                    )}
                </div>

                {/* Must-try items */}
                {mustTry.length > 0 && (
                    <div className="mx-5 mb-4 p-3 rounded-xl bg-primary/5 border border-primary/10">
                        <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2">⭐ Món nên thử</p>
                        <div className="flex flex-wrap gap-1.5">
                            {mustTry.map((dish, i) => (
                                <span
                                    key={i}
                                    className="px-2.5 py-1 bg-white border border-primary/15 rounded-full text-[11px] font-semibold text-slate-700 shadow-sm"
                                >
                                    {dish}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Open link button — always shown, uses qrValue as href */}
                <div className="px-5 pb-6">
                    <a
                        href={qrValue}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-primary text-white rounded-2xl font-bold text-sm shadow-lg shadow-primary/30 active:scale-[.97] transition-transform"
                    >
                        <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>open_in_new</span>
                        {isDemo ? 'Mở link demo' : 'Mở link'}
                    </a>
                </div>

                {/* Safe area spacer on iPhone */}
                <div className="h-safe-bottom" />
            </div>
        </div>
    );
}
