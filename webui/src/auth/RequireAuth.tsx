import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { safeReturnPath } from './return-path';

/** Gate for app routes: redirects to /login unless authenticated. */
export function RequireAuth() {
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
  return <Outlet />;
}
