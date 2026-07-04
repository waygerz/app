import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { savePendingLinkFromLocation } from '@/lib/pending-link';
import { useAuth } from './AuthContext';
import { safeReturnPath } from './return-path';

/** Redirects guests to login (preserving return path). Renders children when authenticated. */
export function AuthRedirectIfGuest({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-dvh w-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) {
    const returnTo = location.pathname + location.search;
    savePendingLinkFromLocation(location.pathname, location.search);
    const loginTo = `/login?next=${encodeURIComponent(safeReturnPath(returnTo))}`;
    return <Navigate to={loginTo} replace />;
  }

  return <>{children}</>;
}