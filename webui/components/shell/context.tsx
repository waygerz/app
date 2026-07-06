'use client';

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useScrollPosition } from '@/hooks/use-scroll-position';

interface LayoutState {
  style: React.CSSProperties;
  bodyClassName: string;
  headerStickyOffset: number;
  isMobile: boolean;
  isSidebarOpen: boolean;
  sidebarToggle: () => void;
}

const LayoutContext = createContext<LayoutState | undefined>(undefined);

interface LayoutProviderProps {
  children: ReactNode;
  style?: React.CSSProperties;
  bodyClassName?: string;
  headerStickyOffset?: number;
}

export function LayoutProvider({
  children,
  style: customStyle,
  bodyClassName = '',
  headerStickyOffset = 100,
}: LayoutProviderProps) {
  const isMobile = useIsMobile();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const scrollPosition = useScrollPosition();

  const defaultStyle = useMemo(
    () => ({
      '--header-height': '80px',
      '--header-height-sticky': '60px',
      '--header-height-mobile': '60px',
    }),
    [],
  );

  const style: React.CSSProperties = {
    ...defaultStyle,
    ...customStyle,
  };

  const sidebarToggle = () => setIsSidebarOpen((open) => !open);

  useEffect(() => {
    const body = document.body;
    const existingClasses = body.className;

    if (bodyClassName) {
      body.className = `${existingClasses} ${bodyClassName}`.trim();
    }

    body.setAttribute('data-header-sticky', String(scrollPosition > headerStickyOffset));

    return () => {
      body.className = existingClasses;
      if (scrollPosition > headerStickyOffset) {
        body.setAttribute('data-header-sticky', 'true');
      } else {
        body.removeAttribute('data-header-sticky');
      }
    };
  }, [bodyClassName, scrollPosition, headerStickyOffset]);

  return (
    <LayoutContext.Provider
      value={{
        bodyClassName,
        style,
        headerStickyOffset,
        isMobile,
        isSidebarOpen,
        sidebarToggle,
      }}
    >
      <div
        data-slot="layout-wrapper"
        className="flex min-w-0 w-full max-w-full grow overflow-x-hidden"
        data-sidebar-open={isSidebarOpen}
        style={style}
      >
        <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
      </div>
    </LayoutContext.Provider>
  );
}

export const useLayout = () => {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
};
