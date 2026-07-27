import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface SketchAuthLayoutProps {
  partner?: boolean;
  title: string;
  description: string;
  children: ReactNode;
}

export default function SketchAuthLayout({ partner = false, title, description, children }: SketchAuthLayoutProps) {
  const navigate = useNavigate();
  return (
    <div className={`sketch-auth ${partner ? 'is-partner' : ''}`}>
      <section className="sketch-auth-story">
        <div className="sketch-auth-brand"><span className="sketch-brand-square" /><strong>{partner ? 'NeonFoodmap Partner' : 'NeonFoodmap'}</strong></div>
        <div className="sketch-auth-copy"><span className="sketch-label">{partner ? 'Cổng thông tin đối tác kinh doanh' : 'Tài khoản du khách'}</span><h1>{title}</h1><p>{description}</p></div>
        <div className="sketch-auth-meta">{(partner ? [['TTS', 'Giọng tự động'], ['QR', 'Điểm chạm tại chỗ'], ['CMS', 'Quản trị nội dung']] : [['05', 'Ngôn ngữ'], ['03', 'Giọng vùng miền'], ['SYNC', 'Đa thiết bị']]).map(([value, label]) => <div key={value}><strong>{value}</strong><span>{label}</span></div>)}</div>
      </section>
      <section className="sketch-auth-zone">
        <div className="sketch-auth-panel">
          <div className="sketch-auth-panel-head"><span className="sketch-script">{partner ? 'Partner Portal' : 'NeonFoodmap'}</span><button type="button" className="sketch-icon-button" aria-label="Quay lại" onClick={() => navigate(partner ? '/settings' : '/map')}>×</button></div>
          {children}
        </div>
      </section>
    </div>
  );
}
