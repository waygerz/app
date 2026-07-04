import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { safeReturnPath } from './return-path';

/** Unknown routes: send guests to login (preserving path), members to home. */
export function FallbackRedirect() {
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
    const loginTo =
      returnTo === '/'
        ? '/login'
        : `/login?next=${encodeURIComponent(safeReturnPath(returnTo))}`;
    return <Navigate to={loginTo} replace />;
  }

  return <Navigate to="/" replace />;
}