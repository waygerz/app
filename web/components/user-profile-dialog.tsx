'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { wagersApi, viewerSide, wagerPick, type Wager } from '@/lib/wagers';
import { usersApi } from '@/lib/users';
import { formatCredits } from '@/lib/wallet';
import { UserAvatar } from '@/components/user-avatar';
import { TeamLogo } from '@/components/event-card';
import { FavoriteTeamPills } from '@/components/favorite-teams';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// The outcome/status shown per bet, with the board-grid colour vocabulary:
// brand win / destructive loss / blue in-flight / muted void — shown as a
// tinted pill (`text` + `tint`) to match the bet cards.
function outcome(w: Wager, me: string): { label: string; text: string; tint: string } {
  if (w.winner_user_id) {
    return w.winner_user_id === me
      ? { label: 'Won', text: 'text-brand', tint: 'bg-brand/20' }
      : { label: 'Lost', text: 'text-destructive', tint: 'bg-destructive/20' };
  }
  const inFlight = { text: 'text-blue-500', tint: 'bg-blue-500/20' };
  const voided = { text: 'text-muted-foreground', tint: 'bg-muted/60' };
  switch (w.status) {
    case 'open':
      return { label: 'Pending', ...inFlight };
    case 'accepted':
      return { label: 'Active', ...inFlight };
    case 'completed':
      return { label: 'Awaiting result', ...inFlight };
    case 'declined':
      return { label: 'Declined', ...voided };
    case 'cancelled':
      return { label: 'Cancelled', ...voided };
    case 'refunded':
      return { label: 'Refunded', ...voided };
    default:
      return { label: w.status, ...voided };
  }
}

export function UserProfileDialog({
  userId,
  name,
  avatarKey,
  open,
  onOpenChange,
}: {
  userId: string;
  name: string;
  avatarKey?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const me = user?.id ?? '';

  // All of my wagers (shares the Bets view's cache + its invalidations),
  // narrowed to this person.
  const wagersQ = useQuery({
    queryKey: ['wagers-all'],
    queryFn: () => wagersApi.all(),
    enabled: open && !!me,
    staleTime: 30_000,
  });

  // Public profile (name, avatar, favorite teams) for the viewed user.
  const profileQ = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: () => usersApi.getUserProfile(userId),
    enabled: open && !!userId,
    staleTime: 60_000,
  });
  const favorites = profileQ.data?.profile.favorite_teams ?? [];

  const bets = useMemo(
    () =>
      (wagersQ.data ?? []).filter(
        (w) => w.proposer_id === userId || w.acceptor_id === userId,
      ),
    [wagersQ.data, userId],
  );

  const { wins, losses } = useMemo(() => {
    let wins = 0;
    let losses = 0;
    for (const w of bets) {
      if (w.winner_user_id === me) wins++;
      else if (w.winner_user_id === userId) losses++;
    }
    return { wins, losses };
  }, [bets, me, userId]);

  // Name who's ahead so the two numbers can't be misread. `wins`/`losses` are
  // always from your perspective; the leader's tally is shown first.
  const total = bets.length;
  const totalLabel = `${total} bet${total === 1 ? '' : 's'}`;
  const decided = wins + losses;
  const firstName = name.split(' ')[0] || name;
  const record =
    decided === 0
      ? total > 0
        ? `${totalLabel}, none settled yet`
        : 'No bets yet'
      : wins === losses
        ? `Even ${wins}–${losses} · ${totalLabel}`
        : wins > losses
          ? `You lead ${wins}–${losses} · ${totalLabel}`
          : `${firstName} leads ${losses}–${wins} · ${totalLabel}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="sr-only">{name}</DialogTitle>
          <div className="flex flex-col items-center gap-2 text-center">
            <UserAvatar
              userId={userId}
              name={name}
              imageUrl={avatarKey}
              className="size-20"
              fallbackClassName="text-2xl"
              clickable={false}
            />
            <div className="flex flex-col gap-0.5">
              <span className="text-lg font-semibold text-foreground">{name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{record}</span>
            </div>
          </div>
        </DialogHeader>

        <DialogBody>
          {favorites.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Favorite teams
              </div>
              <FavoriteTeamPills teams={favorites} />
            </div>
          )}

          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Bets between you
          </div>

          {wagersQ.isPending ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : bets.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No bets between you two yet.
            </p>
          ) : (
            <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
              {bets.map((w) => {
                const o = outcome(w, me);
                const pick = wagerPick(w, viewerSide(w, me));
                const brag = w.amount_cents === 0;
                return (
                  <li
                    key={w.id}
                    className="flex items-center gap-2.5 rounded-md bg-muted/60 p-2.5"
                  >
                    <div className="flex shrink-0 gap-1">
                      <TeamLogo src={null} name={w.away_team} size="xs" framed />
                      <TeamLogo src={null} name={w.home_team} size="xs" framed />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {w.away_team} <span className="text-muted-foreground">vs</span> {w.home_team}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        Pick: {pick}
                        {w.league ? ` · ${w.league.toUpperCase()}` : ''}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', o.text, o.tint)}>
                        {o.label}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                        {brag ? (
                          <>
                            <span aria-hidden className="text-sm leading-none">🍺</span>
                            Beer
                          </>
                        ) : (
                          formatCredits(w.amount_cents)
                        )}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
