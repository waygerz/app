'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from './AuthContext';
import { safeReturnPath } from './return-path';

/**
 * Guest-only pages (login / signup): once the session is confirmed signed-in,
 * send the user to their destination (`?next`, else the dashboard) instead of
 * showing the login form. Renders children for genuine guests.
 *
 * The redirect runs in an effect via `router.replace` — NOT a render-time
 * `redirect()`. Calling `redirect()` during render as a reaction to the auth
 * state flipping (e.g. right after a login) throws a client-side exception; the
 * effect defers navigation to after render, which is safe. We gate on the
 * *confirmed* `user` (after AuthContext's on-mount check/refresh), not raw cookie
 * presence, so a dead/expired session can't ping-pong /login ↔ /. The loading
 * gate (shown while checking or redirecting) avoids flashing the login form.
 */
export function AuthRedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!loading && user) {
      router.replace(safeReturnPath(searchParams.get('next')));
    }
  }, [loading, user, router, searchParams]);

  if (loading || user) {
    return (
      <div className="flex min-h-dvh w-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
