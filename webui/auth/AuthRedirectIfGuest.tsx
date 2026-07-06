'use client';

import type { ReactNode } from 'react';
import { redirect, usePathname, useSearchParams } from 'next/navigation';
import { savePendingLinkFromLocation } from '@/lib/pending-link';
import { useAuth } from './AuthContext';
import { safeReturnPath } from './return-path';

/** Redirects guests to login (preserving return path). Renders children when authenticated. */
export function AuthRedirectIfGuest({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (loading) {
    return (
      <div className="flex min-h-dvh w-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) {
    const qs = searchParams.toString();
    const search = qs ? `?${qs}` : '';
    const returnTo = pathname + search;
    savePendingLinkFromLocation(pathname, search);
    redirect(`/login?next=${encodeURIComponent(safeReturnPath(returnTo))}`);
  }

  return <>{children}</>;
}
