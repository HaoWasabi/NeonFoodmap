import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { getPOIsNearMe } from '../services/api';
import type { POI } from '../types';

// Hard-coded demo POIs để luôn có QR dù API chưa trả về
const DEMO_FALLBACK: { code: string; name: string }[] = [
    { code: 'BCSD-POI-001', name: '🍜 Phố Ẩm Thực Vĩnh Khánh' },
    { code: 'BCSD-POI-002', name: '🏛️ Bảo Tàng Lịch Sử' },
    { code: 'BCSD-POI-003', name: '⛪ Nhà Thờ Lớn' },
];

export default function DemoQRPage() {
    const [pois, setPois] = useState<{ code: string; name: string }[]>(DEMO_FALLBACK);
    const [selected, setSelected] = useState(0);
    const [loading, setLoading] = useState(true);

    // Thử fetch POI thật từ backend
    useEffect(() => {
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    const data = await getPOIsNearMe(pos.coords.latitude, pos.coords.longitude, "50000");
                    const withQR = data.filter((p: POI) => p.qr_code_data);
                    if (withQR.length > 0) {
                        setPois(withQR.map((p: POI) => ({
                            code: p.qr_code_data!,
                            name: p.name,
                        })));
                    }
                } catch {
                    // fallback to hardcoded
                }
                setLoading(false);
            },
            () => setLoading(false),
            { timeout: 3000 }
        );
    }, []);

    const current = pois[selected];

    return (
        <div className="min-h-dvh bg-slate-900 flex flex-col items-center justify-center p-6 select-none">
            {/* Header */}
            <div className="mb-8 text-center">
                <p className="text-primary text-xs font-bold uppercase tracking-widest mb-1">Bước Chân Sói Đá</p>
                <h1 className="text-white text-2xl font-black">Demo QR Code</h1>
                <p className="text-slate-400 text-sm mt-1">Dùng app quét mã bên dưới để trải nghiệm</p>
            </div>

            {/* QR Card */}
            <div className="bg-white rounded-3xl p-8 shadow-2xl flex flex-col items-center gap-4 w-full max-w-xs">
                <QRCodeSVG
                    value={current.code}
                    size={220}
                    bgColor="#ffffff"
                    fgColor="#0f172a"
                    level="H"
                    includeMargin={false}
                />
                <div className="text-center">
                    <p className="text-slate-900 font-bold text-base leading-snug">{current.name}</p>
                    <p className="text-slate-400 text-xs mt-1 font-mono">{current.code}</p>
                </div>
            </div>

            {/* POI selector */}
            {pois.length > 1 && (
                <div className="mt-6 flex gap-2 flex-wrap justify-center">
                    {pois.map((p, i) => (
                        <button
                            key={p.code}
                            onClick={() => setSelected(i)}
                            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                                i === selected
                                    ? 'bg-primary text-white shadow-lg shadow-primary/40'
                                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                            }`}
                        >
                            {p.name}
                        </button>
                    ))}
                </div>
            )}

            {/* Instructions */}
            <div className="mt-8 max-w-xs text-center">
                <div className="flex flex-col gap-2 text-sm text-slate-400">
                    <p>1️⃣ Mở app trên điện thoại</p>
                    <p>2️⃣ Nhấn nút <span className="text-primary font-bold">QR Scanner</span> 📷</p>
                    <p>3️⃣ Hướng camera vào mã bên trên</p>
                    <p>4️⃣ Nghe thuyết minh → xem card quán → nhấn QR quán 🔲</p>
                </div>
            </div>

            {loading && (
                <p className="mt-4 text-xs text-slate-500 animate-pulse">Đang tìm POI gần bạn...</p>
            )}

            {/* Back link */}
            <a
                href="/map"
                className="mt-8 text-xs text-slate-500 hover:text-primary transition-colors"
            >
                ← Về bản đồ
            </a>
        </div>
    );
}
