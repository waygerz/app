'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutProvider } from '@/components/shell/context';
import { Header } from '@/components/shell/header';
import { BottomNav } from '@/components/shell/bottom-nav';
import { ScreenLoader } from '@/components/screen-loader';
import { ProfileDialogProvider } from '@/components/profile-dialog-provider';
import { useAuth } from '@/auth/AuthContext';

export default function Layout({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // The middleware only checks that the auth cookie *exists* — it can't tell if
  // the token is valid. A stale cookie passes it, so /me fails and `user` is
  // null. This is the real gate: once bootstrap resolves with no user, bounce to
  // login rather than render an authed page for a signed-out visitor.
  useEffect(() => {
    if (!loading && !user) {
      const next = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${next}`);
    }
  }, [loading, user, pathname, router]);

  // Show the loader while bootstrapping *and* while an unauthenticated visitor is
  // being redirected — never flash authed content.
  if (loading || !user) {
    return <ScreenLoader />;
  }

  return (
    <LayoutProvider
      headerStickyOffset={100}
      style={
        {
          '--header-height': '90px',
          '--header-height-sticky': '70px',
          '--header-height-mobile': '70px',
        } as React.CSSProperties
      }
    >
      <ProfileDialogProvider me={user.id}>
        <Header />
        {/* overflow-x-clip, not hidden: hidden makes main a scroll container,
            which breaks position: sticky (the pinned league tabs).
            Bottom padding: the fixed BottomNav is ~4rem tall (plus its own
            safe-area inset) — add 1.5rem more so the last card has a real gap
            above it, not just technical non-overlap. */}
        <main
          className="app-column app-frame flex min-w-0 grow flex-col overflow-x-clip pt-[calc(var(--header-height-mobile)_+_env(safe-area-inset-top))] pb-[calc(5.5rem_+_env(safe-area-inset-bottom))] lg:pt-(--header-height) lg:pb-0"
          role="main"
        >
          {children}
        </main>
        <BottomNav />
      </ProfileDialogProvider>
    </LayoutProvider>
  );
}
