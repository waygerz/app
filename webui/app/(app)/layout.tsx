'use client';

import { ReactNode } from 'react';
import { LayoutProvider } from '@/components/shell/context';
import { Header } from '@/components/shell/header';
import { ScreenLoader } from '@/components/screen-loader';
import { useAuth } from '@/auth/AuthContext';

export default function Layout({ children }: { children: ReactNode }) {
  const { loading } = useAuth();

  // Gate on real auth bootstrap (replaces the old fake 1s timer). Middleware has
  // already guaranteed a cookie exists; here we wait for /me to resolve the user.
  if (loading) {
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
