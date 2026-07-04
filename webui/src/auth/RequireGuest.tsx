import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

/** Gate for login/signup: authenticated users go to the dashboard. */
export function RequireGuest() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-dvh w-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (user) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}