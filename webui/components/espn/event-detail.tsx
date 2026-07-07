'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { fetchEspnDetail, ESPN_SPORTS, type EspnDetail } from '@/lib/espn';
import { Card } from '@/components/ui/card';
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

          {renderBody(sport, shape, q.data)}
        </>
      )}
    </div>
  );
}

// Field sports (golf, racing) only have a field once play begins, so a scheduled
// one shows a clear "upcoming" card rather than an empty list. MMA/cricket know
// their matchups ahead of time, so those still render even when scheduled.
function renderBody(sport: string, shape: string, d: EspnDetail) {
  const hasData =
    shape === 'field' ? (d.field?.length ?? 0) > 0
    : shape === '1v1' ? (d.fights?.length ?? 0) > 0
    : Boolean(d.summary.home || d.summary.away);

  if (d.summary.status === 'scheduled' && !hasData) {
    const noun = sport === 'racing' ? 'grid' : 'field';
    return (
      <Card className="items-center gap-2 p-8 text-center sm:p-10">
        <CalendarClock className="size-7 text-muted-foreground" />
        <p className="text-base font-semibold text-foreground">Upcoming</p>
        <p className="text-sm text-muted-foreground">
          {d.summary.start_date ? `Starts ${formatDay(d.summary.start_date)}. ` : ''}
          The {noun} posts once play begins.
        </p>
      </Card>
    );
  }

  if (shape === 'field') return <Leaderboard field={d.field ?? []} />;
  if (shape === '1v1') return <FightCard fights={d.fights ?? []} />;
  return <MatchCard summary={d.summary} />;
}
