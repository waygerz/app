import { ReactNode, Suspense } from 'react';
import { Inter } from 'next/font/google';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { Metadata, Viewport } from 'next';
import { ThemeProvider } from 'next-themes';
import { Providers } from '@/providers';
import { ColorThemeProvider, colorThemeScript } from '@/components/theme/color-theme';

import '@/styles/globals.css';
const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    template: '%s | Waygerz',
    default: 'Waygerz',
  },
  description: 'Social sports wagering with friends.',
  icons: {
    icon: [{ url: '/favicon.png', type: 'image/png', sizes: '32x32' }],
    apple: '/favicon.png',
  },
};

// Mobile-first (~99% of traffic is phones). `viewportFit: 'cover'` lets the app
// paint under the notch/home-indicator and enables the `env(safe-area-inset-*)`
// values the header + main use. User scaling is intentionally left enabled
// (never set maximum-scale / user-scalable=no — it breaks accessibility zoom).
// `interactiveWidget: 'resizes-content'` shrinks the layout viewport when the
// on-screen keyboard opens, so the full-height chat composer (pinned to the
// bottom of the 100vh main) stays above the keyboard instead of behind it.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: colorThemeScript }} />
      </head>
      <body
        className={cn(
          'antialiased flex h-full text-base text-foreground bg-background',
          inter.className,
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          storageKey="nextjs-theme"
          enableSystem
          disableTransitionOnChange
          enableColorScheme
        >
          <ColorThemeProvider>
            <TooltipProvider delayDuration={0}>
              <Providers>
                <Suspense>{children}</Suspense>
              </Providers>
              <Toaster />
            </TooltipProvider>
          </ColorThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
