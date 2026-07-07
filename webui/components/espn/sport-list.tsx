'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { fetchEspnList, ITEM_NOUN, ESPN_SPORTS, type EspnSummary } from '@/lib/espn';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EspnStatusBadge, formatDay, CompetitorLogo } from './shared';

export function EspnSportList({ sport }: { sport: string }) {
  const noun = ITEM_NOUN[sport] ?? { one: 'event', many: 'Events' };
  const shape = ESPN_SPORTS[sport];
  const q = useQuery({ queryKey: ['espn-list', sport], queryFn: () => fetchEspnList(sport) });
  const items = q.data ?? [];

  return (
    <div className="container py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold capitalize text-foreground">{sport}</h1>
        <p className="text-sm text-muted-foreground">{noun.many} — live from ESPN.</p>
      </div>

      {q.isError && (
        <div className="mb-4 text-sm text-destructive">
          Couldn’t load {sport}: {(q.error as Error).message}
        </div>
      )}

      {q.isLoading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      )}

      {!q.isLoading && items.length === 0 && !q.isError && (
        <div className="text-sm text-muted-foreground">No {noun.many.toLowerCase()} right now.</div>
      )}

      <div className="flex flex-col gap-3">
        {items.map((s) => <SummaryRow key={s.external_id} sport={sport} shape={shape} s={s} />)}
      </div>
    </div>
  );
}

function SummaryRow({ sport, shape, s }: { sport: string; shape: string; s: EspnSummary }) {
  return (
    <Link href={`/sports/${sport}/${s.external_id}`} className="group">
      <Card className="cursor-pointer gap-2 p-4 transition-all group-hover:border-primary">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{s.name}</span>
          <EspnStatusBadge status={s.status} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {s.league_name && <Badge size="sm" appearance="light" variant="secondary">{s.league_name}</Badge>}
          {s.start_date && <span>{formatDay(s.start_date)}</span>}
          {shape === 'field' && s.field_size ? <span>· {s.field_size} players</span> : null}
          {shape === '1v1' && s.fight_count ? <span>· {s.fight_count} fights</span> : null}
        </div>
        {shape === 'team' && (s.home || s.away) && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-sm text-foreground">
            <CompetitorLogo src={s.away?.logo} name={s.away?.name ?? '?'} size={20} />
            <span className="truncate">{s.away?.name}{s.away?.score != null ? ` ${s.away.score}` : ''}</span>
            <span className="text-xs text-muted-foreground">v</span>
            <CompetitorLogo src={s.home?.logo} name={s.home?.name ?? '?'} size={20} />
            <span className="truncate">{s.home?.name}{s.home?.score != null ? ` ${s.home.score}` : ''}</span>
          </div>
        )}
      </Card>
    </Link>
  );
}
