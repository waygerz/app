'use client';

import type { ReactNode } from 'react';
import { redirect, useSearchParams } from 'next/navigation';
import { useAuth } from './AuthContext';
import { safeReturnPath } from './return-path';

/**
 * Guest-only pages (login / signup): once the session is confirmed signed-in,
 * redirect to the intended destination (`?next`, else the dashboard) instead of
 * showing the login form. Renders children for genuine guests.
 *
 * We gate on the *confirmed* `user` — set only after AuthContext's on-mount
 * session check/refresh — not on raw cookie presence. That's what keeps a dead
 * or expired session from ping-ponging /login ↔ / (the reason the server
 * middleware only bounces users with a live access cookie). The loading gate
 * avoids flashing the login form while the session is being confirmed.
 */
export function AuthRedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();

  if (loading) {
    return (
      <div className="flex min-h-dvh w-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (user) {
    redirect(safeReturnPath(searchParams.get('next')));
  }

  return <>{children}</>;
}
