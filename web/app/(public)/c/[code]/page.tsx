'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  resolveCode,
  actOnCode,
  normalizeCode,
  type InviteAction,
  type LeagueCodePreview,
  type FriendCodePreview,
  type BetCodePreview,
} from '@/lib/invites';
import { fetchEvent } from '@/lib/ingestor';
import { clearPendingLink } from '@/lib/pending-link';
import { AuthRedirectIfGuest } from '@/auth/AuthRedirectIfGuest';
import { useAuth } from '@/auth/AuthContext';
import { Home } from 'lucide-react';
import { CounterButton } from '@/components/counter-dialog';
import { UserAvatar } from '@/components/user-avatar';
import { BetCard } from '@/components/bet-card';
import { LeagueInviteCard } from '@/components/league-invite-card';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

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
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const { user } = useAuth();
  const me = user?.id ?? '';

  // The stash only powered the login-page banner; we're past login now.
  useEffect(() => {
    clearPendingLink();
  }, []);

  const resolved = useQuery({
    queryKey: ['invite-code', code],
    queryFn: () => resolveCode(code),
    retry: false,
  });

  // Live/final scores behind a bet code — same source + live-poll as the bets
  // page, so the shared link shows the game the way the in-app bet card does.
  const betEventId =
    resolved.data?.type === 'bet'
      ? (resolved.data.preview as BetCodePreview | null)?.wager.event_id
      : undefined;
  const eventQ = useQuery({
    queryKey: ['c-bet-event', betEventId ?? ''],
    queryFn: () => fetchEvent(betEventId!),
    enabled: !!betEventId,
    staleTime: 5 * 60_000,
    refetchInterval: (q) => (q.state.data?.status === 'live' ? 30_000 : false),
  });

  const act = useMutation({
    mutationFn: (action: InviteAction) => actOnCode(code, action),
    onSuccess: (res, action) => {
      qc.invalidateQueries({ queryKey: ['leagues'] });
      qc.invalidateQueries({ queryKey: ['friends'] });
      qc.invalidateQueries({ queryKey: ['friend-requests'] });
      qc.invalidateQueries({ queryKey: ['wagers-all'] });
      qc.invalidateQueries({ queryKey: ['wagers'] });
      if (res.type === 'league') {
        toast.success('Joined');
        router.push(`/leagues/${res.target_id}`);
      } else if (res.type === 'bet') {
        if (action === 'undecline') {
          // Stay on the bet view and re-resolve so Accept/Counter/Reject return.
          toast.success('Bet reopened');
          qc.invalidateQueries({ queryKey: ['invite-code', code] });
        } else {
          toast.success(action === 'accept' ? 'Bet accepted' : 'Bet rejected');
          router.push('/bets/all');
        }
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

  // A user who just created their account by following a league invite lands
  // here with ?autojoin=1 — honor the invitation automatically instead of
  // making them tap "Join". Scoped to LEAGUE codes only (never auto-accept a
  // money bet or auto-add a friend), non-members, and fired once. On success
  // `act` already routes into the league.
  const autojoin = searchParams.get('autojoin') === '1';
  const autoJoined = useRef(false);
  useEffect(() => {
    if (!autojoin || autoJoined.current || act.isPending) return;
    const d = resolved.data;
    if (
      d?.state === 'ok' &&
      d.type === 'league' &&
      d.viewer.relationship !== 'member'
    ) {
      autoJoined.current = true;
      act.mutate('join');
    }
  }, [autojoin, resolved.data, act]);

  if (resolved.isLoading) {
    // Bare content — the default export already wraps this in the outer Card,
    // so returning another Card here would nest (doubled border/padding).
    return (
      <>
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="size-16 rounded-full" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-full rounded-lg" />
      </>
    );
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
        <LeagueInviteCard league={lg} />

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

  // ---- Bet challenge -------------------------------------------------------
  if (data.type === 'bet' && data.preview) {
    const w = (data.preview as BetCodePreview).wager;
    const rel = data.viewer.relationship;
    const busy = act.isPending;
    // Drive off my_turn, not "acceptor" — after a counter it may be the proposer's
    // turn. The viewer's own side (mySide) is highlighted, and the "other party" is
    // whoever last acted.
    const iAmProposer = rel === 'proposer';
    const involved = rel === 'proposer' || rel === 'acceptor';
    const otherName = iAmProposer ? w.acceptor_name : w.proposer_name;
    // Fall back to the acceptor check if my_turn is absent (an old backend during a
    // deploy window) so the acceptor never loses their Accept button.
    const myTurn = data.viewer.my_turn ?? rel === 'acceptor';
    const countered = (w.stake_round ?? 0) > 0;
    const canAct = myTurn && data.actions.includes('accept');
    // A declined bet the viewer turned down can be reopened (until kickoff).
    const canUndecline = myTurn && data.actions.includes('undecline');
    const decided = w.status === 'completed' || w.status === 'settled';
    const terminal = w.status === 'declined' || w.status === 'cancelled' || w.status === 'refunded';

    return (
      <>
        {/* The code's viewer state is the source of truth for whose turn it is. */}
        <BetCard
          wager={{ ...w, my_turn: myTurn }}
          event={eventQ.data ?? null}
          me={me}
          headline={canUndecline ? 'You declined this bet' : undefined}
        />

        {canAct ? (
          <div className="flex flex-col gap-2">
            <Button onClick={() => act.mutate('accept')} disabled={busy}>
              {act.isPending ? 'Working…' : 'Accept'}
            </Button>
            {/* Renegotiate stake/line before the bet goes live — same dialog as the
                in-app bets page. The counter endpoint gates on my_turn server-side,
                so on success re-resolve the code to flip this into the waiting state. */}
            <CounterButton
              wager={w}
              me={me}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ['invite-code', code] });
                qc.invalidateQueries({ queryKey: ['wagers-all'] });
                qc.invalidateQueries({ queryKey: ['wagers'] });
              }}
            />
            <Button variant="outline" onClick={() => act.mutate('decline')} disabled={busy}>
              Reject
            </Button>
          </div>
        ) : canUndecline ? (
          <div className="flex flex-col gap-2">
            <p className="text-center text-sm text-muted-foreground">
              Changed your mind? Reopen this bet to accept it.
            </p>
            <Button onClick={() => act.mutate('undecline')} disabled={busy}>
              {act.isPending ? 'Reopening…' : 'Un-decline'}
            </Button>
            <Button variant="outline" onClick={() => router.push('/bets/all')}>View bets</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {!decided && !terminal && (
              <p className="text-center text-sm text-muted-foreground">
                {w.status === 'accepted'
                  ? 'Locked in — this bet is live.'
                  : involved
                    ? `Waiting on ${otherName} to respond${countered ? ' to your counter' : ''}.`
                    : "This bet isn't addressed to you."}
              </p>
            )}
            <Button variant="outline" onClick={() => router.push('/bets/all')}>View bets</Button>
          </div>
        )}
        <Button variant="ghost" className="w-full" onClick={() => router.push('/')}>
          <Home className="size-4" />
          Home
        </Button>
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
