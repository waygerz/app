import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { AuthRedirectIfAuthenticated } from '@/auth/AuthRedirectIfAuthenticated';

// Guest-only routes (login / signup). If the visitor is already signed in they
// get sent to the dashboard (or their ?next target) rather than seeing the
// login form. Suspense satisfies useSearchParams' boundary requirement.
export default function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AuthRedirectIfAuthenticated>{children}</AuthRedirectIfAuthenticated>
    </Suspense>
  );
}
