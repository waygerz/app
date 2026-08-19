'use client';

import { ReactNode, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { wagersApi } from '@/lib/wagers';
import { cn } from '@/lib/utils';
import { FILTERS, filterWagers, type BetFilter } from './bets-common';

export default function BetsLayout({ children }: { children: ReactNode }) {
  const { data: wagers = [] } = useQuery({
    queryKey: ['wagers-all'],
    queryFn: () => wagersApi.all(),
  });

  const counts = useMemo(() => {
    const out = {} as Record<BetFilter, number>;
    for (const f of FILTERS) out[f.key] = filterWagers(wagers, f.key).length;
    return out;
  }, [wagers]);

  const pathname = usePathname();

  return (
    <div className="container min-w-0 w-full py-5 sm:py-8">
      {/* Title rides in the top bar on mobile; keep it in-page on desktop. */}
      <h1 className="mb-6 hidden text-2xl font-bold text-foreground lg:block">My Bets</h1>

      <nav className="mb-6 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => {
          const to = `/bets/${f.key}`;
          const isActive = pathname === to;
          return (
            <Link
              key={f.key}
              href={to}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {f.label}
              {counts[f.key] > 0 && (
                <span className={cn('ms-1.5 text-xs', isActive ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                  ({counts[f.key]})
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
