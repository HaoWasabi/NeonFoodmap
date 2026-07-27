import type { ReactNode } from 'react';
import FoodmapShell, { ShellIcon as SketchIcon } from './FoodmapShell';

type SketchNav = 'map' | 'tours' | 'offline' | 'settings';

interface SketchFrameProps {
  active: SketchNav;
  children: ReactNode;
  className?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  topRight?: ReactNode;
  routeMark?: string;
  routeTitle?: string;
  routeMeta?: string;
  routeProgress?: number;
  hideTopbar?: boolean;
  hideBottomNav?: boolean;
}

export default function SketchFrame({
  children,
  className = '',
  searchPlaceholder,
  searchValue,
  onSearchChange,
  topRight,
  routeMark,
  routeTitle,
  routeMeta,
  routeProgress,
  hideTopbar,
  hideBottomNav,
}: SketchFrameProps) {
  return (
    <FoodmapShell
      variant="default"
      contentClassName={`sketch-main ${className}`}
      searchValue={searchValue}
      onSearchChange={onSearchChange}
      searchPlaceholder={searchPlaceholder}
      topRight={topRight}
      routeMark={routeMark}
      routeTitle={routeTitle}
      routeMeta={routeMeta}
      routeProgress={routeProgress}
      hideAudio={true}
      hideTopbar={hideTopbar}
      hideBottomNav={hideBottomNav}
    >
      {children}
    </FoodmapShell>
  );
}

export { SketchIcon };
