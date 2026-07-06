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
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Bets</h1>
          <p className="text-sm text-muted-foreground">Head-to-head wagers across all your leagues</p>
        </div>
      </div>

      <nav className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-input bg-background p-1.5">
        {FILTERS.map((f) => {
          const to = `/bets/${f.key}`;
          const isActive = pathname === to;
          return (
            <Link
              key={f.key}
              href={to}
              className={cn(
                'shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                'text-muted-foreground hover:bg-muted hover:text-foreground',
                isActive && 'bg-muted text-foreground',
              )}
            >
              {f.label}
              {counts[f.key] > 0 && (
                <span className="ms-1.5 text-xs text-muted-foreground">({counts[f.key]})</span>
              )}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
