'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  resolveCode,
  actOnCode,
  normalizeCode,
  type InviteAction,
  type LeagueCodePreview,
  type FriendCodePreview,
} from '@/lib/invites';
import { leagueTypeLabel } from '@/lib/leagues';
import { formatCredits } from '@/lib/wallet';
import { clearPendingLink } from '@/lib/pending-link';
import { AuthRedirectIfGuest } from '@/auth/AuthRedirectIfGuest';
import { LeagueAvatar } from '@/components/league-avatar';
import { UserAvatar } from '@/components/user-avatar';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function periodLabel(p: LeagueCodePreview): string {
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

function Dead({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Link href="/" className="text-sm text-primary hover:underline">Go to dashboard</Link>
    </div>
  );
}

function CodeContent({ code }: { code: string }) {
  const router = useRouter();
  const qc = useQueryClient();

  // The stash only powered the login-page banner; we're past login now.
  useEffect(() => {
    clearPendingLink();
  }, []);

  const resolved = useQuery({
    queryKey: ['invite-code', code],
    queryFn: () => resolveCode(code),
    retry: false,
  });

  const act = useMutation({
    mutationFn: (action: InviteAction) => actOnCode(code, action),
    onSuccess: (res, action) => {
      qc.invalidateQueries({ queryKey: ['leagues'] });
      qc.invalidateQueries({ queryKey: ['friends'] });
      qc.invalidateQueries({ queryKey: ['friend-requests'] });
      if (res.type === 'league') {
        toast.success('Joined');
        router.push(`/leagues/${res.target_id}`);
      } else if (action === 'decline') {
        toast.success('Declined');
        router.push('/');
      } else {
        toast.success(action === 'accept' ? 'Friend added' : 'Friend request sent');
        router.push('/friends');
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (resolved.isLoading) {
    return <p className="text-center text-sm text-muted-foreground">Loading invite…</p>;
  }

  const data = resolved.data;
  if (resolved.isError || !data) {
    return <Dead message="This invite link is invalid or has expired." />;
  }
  if (data.state !== 'ok') {
    return (
      <Dead
        message={
          data.state === 'consumed'
            ? 'This invite has already been used.'
            : data.state === 'expired'
              ? 'This invite has expired.'
              : 'This invite link is invalid.'
        }
      />
    );
  }

  // ---- League invite -------------------------------------------------------
  if (data.type === 'league' && data.preview) {
    const lg = data.preview as LeagueCodePreview;
    const rel = data.viewer.relationship;
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
          {lg.min_wager_cents != null && <Row label="Min wager" value={formatCredits(lg.min_wager_cents)} />}
          {lg.max_wager_cents != null && <Row label="Max wager" value={formatCredits(lg.max_wager_cents)} />}
          {lg.sports.length > 0 && (
            <Row label="Sports" value={lg.sports.map((s) => s.name || s.sport_league_id).join(', ')} />
          )}
        </div>

        {rel === 'member' ? (
          <div className="flex flex-col gap-2">
            <p className="text-center text-sm text-muted-foreground">You are already in this league.</p>
            <Button onClick={() => router.push(`/leagues/${lg.id}`)}>Open league</Button>
            <Button variant="outline" onClick={() => router.push('/')}>Not now</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-center text-sm text-muted-foreground">
              {rel === 'left' ? 'Rejoin this league?' : 'Join this league?'}
            </p>
            <Button onClick={() => act.mutate('join')} disabled={act.isPending}>
              {act.isPending ? 'Joining…' : rel === 'left' ? `Rejoin ${lg.name}` : `Join ${lg.name}`}
            </Button>
            <Button variant="outline" onClick={() => router.push('/')} disabled={act.isPending}>
              Decline
            </Button>
          </div>
        )}
      </>
    );
  }

  // ---- Friend invite -------------------------------------------------------
  if (data.type === 'friend' && data.preview) {
    const user = (data.preview as FriendCodePreview).user;
    const rel = data.viewer.relationship;
    const busy = act.isPending;
    return (
      <>
        <div className="flex flex-col items-center gap-3 text-center">
          <UserAvatar
            userId={user.id}
            name={user.display_name}
            imageUrl={user.avatar_key}
            className="size-20"
            fallbackClassName="text-xl"
          />
          <div>
            <h1 className="text-2xl font-bold text-foreground">{user.display_name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">on Waygerz</p>
          </div>
        </div>

        {rel === 'self' ? (
          <p className="text-center text-sm text-muted-foreground">
            This is your friend link — share it so others can add you.
          </p>
        ) : rel === 'friends' ? (
          <div className="flex flex-col gap-2">
            <p className="text-center text-sm text-muted-foreground">You are already friends.</p>
            <Button variant="outline" onClick={() => router.push('/')}>Go to dashboard</Button>
          </div>
        ) : rel === 'pending_out' ? (
          <div className="flex flex-col gap-2">
            <p className="text-center text-sm text-muted-foreground">Friend request already sent.</p>
            <Button variant="outline" onClick={() => router.push('/friends')}>View friends</Button>
          </div>
        ) : rel === 'pending_in' ? (
          <div className="flex flex-col gap-2">
            <p className="text-center text-sm text-muted-foreground">
              {user.display_name} wants to be friends.
            </p>
            <Button onClick={() => act.mutate('accept')} disabled={busy}>
              {act.isPending ? 'Accepting…' : 'Accept'}
            </Button>
            <Button variant="outline" onClick={() => act.mutate('decline')} disabled={busy}>
              Decline
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-center text-sm text-muted-foreground">
              Add {user.display_name} as a friend?
            </p>
            <Button onClick={() => act.mutate('add')} disabled={busy}>
              {act.isPending ? 'Sending…' : 'Add friend'}
            </Button>
            <Button variant="outline" onClick={() => router.push('/')} disabled={busy}>
              Decline
            </Button>
          </div>
        )}
      </>
    );
  }

  return <Dead message="This invite link is invalid." />;
}

export default function InviteCodePage() {
  const params = useParams<{ code: string }>();
  const code = normalizeCode(params.code || '');

  return (
    <div className="flex min-h-dvh w-full items-center justify-center p-4">
      <Card className="w-full max-w-md gap-5 p-6">
        {!code ? (
          <p className="text-center text-sm text-muted-foreground">Missing invite code.</p>
        ) : (
          <AuthRedirectIfGuest>
            <CodeContent code={code} />
          </AuthRedirectIfGuest>
        )}
      </Card>
    </div>
  );
}
