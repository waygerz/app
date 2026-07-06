'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { clearPendingLink } from '@/lib/pending-link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { leaguesApi, leagueTypeLabel, type LeaguePreview } from '@/lib/leagues';
import { formatCredits } from '@/lib/wallet';
import { AuthRedirectIfGuest } from '@/auth/AuthRedirectIfGuest';
import { LeagueAvatar } from '@/components/league-avatar';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function periodLabel(p: LeaguePreview): string {
  const r = (p.rules || {}) as { season_year?: number | string; week_starts_on?: string };
  if (p.period_type === 'season') return `Season${r.season_year ? ` ${r.season_year}` : ''}`;
  return `Weekly${r.week_starts_on ? ` · resets ${r.week_starts_on}` : ''}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-2 last:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground sm:text-right">{value}</span>
    </div>
  );
}

function InviteContent({ code }: { code: string }) {
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    clearPendingLink();
  }, []);

  const preview = useQuery({
    queryKey: ['invite', code],
    queryFn: () => leaguesApi.preview(code),
    retry: false,
  });

  const join = useMutation({
    mutationFn: () => leaguesApi.join(code),
    onSuccess: (lg) => {
      toast.success(`Joined ${lg.name}`);
      qc.invalidateQueries({ queryKey: ['leagues'] });
      router.push(`/leagues/${lg.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (preview.isLoading) {
    return <p className="text-center text-sm text-muted-foreground">Loading invite…</p>;
  }

  if (preview.isError || !preview.data) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">This invite link is invalid or has expired.</p>
        <Link href="/" className="text-sm text-primary hover:underline">Go to Waygerz</Link>
      </div>
    );
  }

  const lg = preview.data;
  const membership = lg.viewer_membership;

  return (
    <>
      <div className="flex flex-col items-center gap-3 text-center">
        <LeagueAvatar name={lg.name} logoUrl={lg.logo_url} id={lg.id} size={88} />
        <div>
          <h1 className="text-2xl font-bold text-foreground">{lg.name}</h1>
          <div className="mt-1 flex items-center justify-center gap-2">
            <Badge size="sm" appearance="light">{leagueTypeLabel(lg.league_type)}</Badge>
            <span className="text-xs text-muted-foreground">
              {lg.member_count} member{lg.member_count === 1 ? '' : 's'}
            </span>
          </div>
          {lg.commissioner_name && (
            <p className="mt-2 text-sm text-muted-foreground">
              Invited by <span className="font-medium text-foreground">{lg.commissioner_name}</span>
            </p>
          )}
        </div>
      </div>

      {lg.description && (
        <p className="rounded-lg bg-muted/50 p-3 text-sm text-foreground">{lg.description}</p>
      )}

      <div className="flex flex-col">
        <Row label="Period" value={periodLabel(lg)} />
        {lg.league_type !== 'pickem' && (
          <Row label="Starting balance" value={formatCredits(lg.starting_balance_cents ?? 0)} />
        )}
        {lg.min_wager_cents != null && (
          <Row label="Min wager" value={formatCredits(lg.min_wager_cents)} />
        )}
        {lg.max_wager_cents != null && (
          <Row label="Max wager" value={formatCredits(lg.max_wager_cents)} />
        )}
        {lg.sports.length > 0 && (
          <Row label="Sports" value={lg.sports.map((s) => s.name || s.sport_league_id).join(', ')} />
        )}
      </div>

      {membership === 'member' ? (
        <div className="flex flex-col gap-2">
          <p className="text-center text-sm text-muted-foreground">You are already in this league.</p>
          <Button onClick={() => router.push(`/leagues/${lg.id}`)}>Open league</Button>
          <Button variant="outline" onClick={() => router.push('/')}>Not now</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-center text-sm text-muted-foreground">
            {membership === 'left' ? 'Rejoin this league?' : 'Join this league?'}
          </p>
          <Button onClick={() => join.mutate()} disabled={join.isPending}>
            {join.isPending ? 'Joining…' : membership === 'left' ? `Rejoin ${lg.name}` : `Join ${lg.name}`}
          </Button>
          <Button variant="outline" onClick={() => router.push('/')} disabled={join.isPending}>
            Decline
          </Button>
        </div>
      )}
    </>
  );
}

export default function InvitePage() {
  const params = useSearchParams();
  const code = (params.get('code') || '').toUpperCase();

  return (
    <div className="flex min-h-dvh w-full items-center justify-center p-4">
      <Card className="w-full max-w-md gap-5 p-6">
        {!code ? (
          <p className="text-center text-sm text-muted-foreground">Missing invite code.</p>
        ) : (
          <AuthRedirectIfGuest>
            <InviteContent code={code} />
          </AuthRedirectIfGuest>
        )}
      </Card>
    </div>
  );
}