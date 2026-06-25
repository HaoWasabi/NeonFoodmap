import type { CSSProperties, ReactNode } from 'react';

/* ─── Primitive Skeletons ─── */

interface SkeletonBoxProps {
  width?: string | number;
  height?: string | number;
  rounded?: string;
  className?: string;
}

export function SkeletonBox({ width = '100%', height = 16, rounded = '8px', className = '' }: SkeletonBoxProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius: rounded }}
    />
  );
}

export function SkeletonText({ width = '75%', className = '' }: { width?: string | number; className?: string }) {
  return <div className={`skeleton skeleton-text ${className}`} style={{ width }} />;
}

export function SkeletonCircle({ size = 40, className = '' }: { size?: number; className?: string }) {
  return <div className={`skeleton skeleton-circle ${className}`} style={{ width: size, height: size }} />;
}

/* ─── Composite Skeletons ─── */

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white rounded-2xl p-4 space-y-3 ${className}`}>
      <SkeletonBox height={120} rounded="12px" />
      <SkeletonText width="60%" />
      <SkeletonText width="40%" />
    </div>
  );
}

export function TourCardSkeleton() {
  return (
    <div className="flex-none w-[220px] bg-white rounded-xl p-3 space-y-3 border border-slate-100">
      <SkeletonBox height={100} rounded="8px" />
      <SkeletonText width="70%" />
      <SkeletonText width="45%" />
    </div>
  );
}

export function PackageSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-4 space-y-3 border border-slate-100">
      <div className="flex items-start gap-3">
        <SkeletonCircle size={28} />
        <div className="flex-1 space-y-2">
          <SkeletonText width="55%" />
          <SkeletonText width="85%" />
          <SkeletonText width="30%" />
        </div>
        <SkeletonBox width={48} height={28} rounded="8px" />
      </div>
    </div>
  );
}

export function MapSkeleton() {
  return (
    <div className="absolute inset-0 z-10 bg-background-light flex flex-col items-center justify-center gap-4 animate-fade-in">
      <div className="relative">
        <SkeletonCircle size={64} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="material-symbols-outlined text-slate-300 text-3xl animate-pulse">map</span>
        </div>
      </div>
      <div className="space-y-2 w-48">
        <SkeletonText width="100%" />
        <SkeletonText width="60%" />
      </div>
      <p className="text-xs text-slate-400 mt-2">Đang tải bản đồ...</p>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="space-y-4 px-4 pt-4 animate-fade-in">
      {/* User card */}
      <div className="bg-white rounded-2xl p-4 flex items-center gap-4">
        <SkeletonCircle size={56} />
        <div className="space-y-2 flex-1">
          <SkeletonText width="40%" />
          <SkeletonText width="65%" />
        </div>
      </div>
      {/* Section */}
      <SkeletonText width="30%" className="!h-3" />
      <div className="bg-white rounded-2xl overflow-hidden">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="flex items-center justify-between p-4 border-b border-slate-50">
            <div className="flex items-center gap-3">
              <SkeletonCircle size={28} />
              <SkeletonText width={80} />
            </div>
            <SkeletonCircle size={20} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function GuidedTourSkeleton() {
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Tab skeleton */}
      <div className="flex gap-6 px-4 py-3 bg-white border-b border-slate-100">
        <SkeletonBox width={60} height={14} rounded="4px" />
        <SkeletonBox width={50} height={14} rounded="4px" />
        <SkeletonBox width={55} height={14} rounded="4px" />
      </div>
      {/* Tour cards carousel */}
      <div className="px-4">
        <SkeletonText width="40%" className="!h-4 mb-3" />
        <div className="flex gap-4 overflow-hidden">
          <TourCardSkeleton />
          <TourCardSkeleton />
        </div>
      </div>
      {/* Route skeleton */}
      <div className="px-4 space-y-4">
        <SkeletonText width="30%" className="!h-4" />
        <SkeletonBox height={160} rounded="12px" />
        {[1,2,3].map(i => (
          <div key={i} className="flex items-start gap-3 ml-3 pl-6 border-l-2 border-dashed border-slate-200">
            <div className="space-y-2 flex-1 pb-4">
              <SkeletonText width={`${50 + i * 10}%`} className="!h-[14px]" />
              <SkeletonText width="35%" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Stagger Helper ─── */
export function StaggerContainer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

export function staggerStyle(index: number): CSSProperties {
  return { '--i': index } as CSSProperties;
}
