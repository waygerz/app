'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { fetchEspnDetail, ESPN_SPORTS } from '@/lib/espn';
import { Skeleton } from '@/components/ui/skeleton';
import { EspnStatusBadge, formatDay } from './shared';
import { Leaderboard } from './leaderboard';
import { FightCard } from './fight-card';
import { MatchCard } from './match-card';

export function EspnEventDetail({ sport, externalId }: { sport: string; externalId: string }) {
  const shape = ESPN_SPORTS[sport];
  const q = useQuery({
    queryKey: ['espn-detail', sport, externalId],
    queryFn: () => fetchEspnDetail(sport, externalId),
  });

  return (
    <div className="container py-8">
      <Link href={`/sports/${sport}`} className="text-sm capitalize text-primary hover:underline">
        ← {sport}
      </Link>

      {q.isLoading && <div className="mt-4"><Skeleton className="h-40 rounded-xl" /></div>}
      {q.isError && (
        <div className="mt-4 text-sm text-destructive">Couldn’t load: {(q.error as Error).message}</div>
      )}
      {!q.isLoading && !q.isError && q.data == null && (
        <div className="mt-4 text-sm text-muted-foreground">Not found.</div>
      )}

      {q.data && (
        <>
          <div className="mb-6 mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-foreground sm:text-2xl">{q.data.summary.name}</h1>
              <EspnStatusBadge status={q.data.summary.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {q.data.summary.league_name}
              {q.data.summary.start_date ? ` · ${formatDay(q.data.summary.start_date)}` : ''}
            </p>
          </div>

          {shape === 'field' && <Leaderboard field={q.data.field ?? []} />}
          {shape === '1v1' && <FightCard fights={q.data.fights ?? []} />}
          {shape === 'team' && <MatchCard summary={q.data.summary} />}
        </>
      )}
    </div>
  );
}
