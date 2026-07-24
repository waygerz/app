'use client';

import { ReactNode, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Ticket } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { wagersApi } from '@/lib/wagers';
import { cn } from '@/lib/utils';
import { FILTERS, filterWagers, type BetFilter } from './bets-common';

export default function BetsLayout({ children }: { children: ReactNode }) {
  const { data: wagers = [] } = useQuery({
    queryKey: ['wagers-all'],
    queryFn: () => wagersApi.all(),
  });
  const { user } = useAuth();
  const me = user?.id ?? '';

  const counts = useMemo(() => {
    const out = {} as Record<BetFilter, number>;
    for (const f of FILTERS) out[f.key] = filterWagers(wagers, f.key, me).length;
    return out;
  }, [wagers, me]);

  const pathname = usePathname();

  return (
    <div className="container min-w-0 w-full py-8">
      <div className="mb-6 flex items-center gap-3">
        <Ticket className="size-7 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">My Bets</h1>
      </div>

      <nav className="mb-6 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => {
          const to = `/bets/${f.key}`;
          const isActive = pathname === to;
          return (
            <Link
              key={f.key}
              href={to}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
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
