'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutProvider } from '@/components/shell/context';
import { Header } from '@/components/shell/header';
import { ScreenLoader } from '@/components/screen-loader';
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
      <Header />
      <main
        className="flex w-full min-w-0 max-w-full grow flex-col overflow-x-hidden pt-(--header-height-mobile) lg:pt-(--header-height)"
        role="main"
      >
        {children}
      </main>
    </LayoutProvider>
  );
}
