'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';
import { leaguesApi, leagueTypeLabel, ordinal, type LeagueCard } from '@/lib/leagues';
import { formatCredits } from '@/lib/wallet';
import { LeagueAvatar } from '@/components/league-avatar';
import { PeriodBadge } from '@/components/period-badge';
import { JoinCodeSheet } from '@/components/join-code-sheet';
import { UserAvatar } from '@/components/user-avatar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Trophy, Swords, Inbox, AlertCircle, RefreshCw, ChevronRight, KeyRound, type LucideIcon } from 'lucide-react';

// Per-type icon + color, matching the landing page: Pick'em = amber trophy,
// H2H = violet swords.
const TYPE_ICON: Record<string, { icon: LucideIcon; color: string }> = {
  pickem: { icon: Trophy, color: 'text-amber-600 dark:text-amber-400' },
  head_to_head: { icon: Swords, color: 'text-violet-600 dark:text-violet-400' },
};
const typeIconFor = (t: string) => TYPE_ICON[t] ?? TYPE_ICON.head_to_head;

// The number on the right of a card: my balance (money), my rank (pick'em),
// or "not started" for a draft.
function CardStat({ c }: { c: LeagueCard }) {
  const [value, label] =
    c.status === 'draft'
      ? ['—', 'not started']
      : c.my_balance_cents != null
        ? [formatCredits(c.my_balance_cents), 'balance']
        : c.my_rank != null
          ? [ordinal(c.my_rank), `of ${c.member_count}`]
          : [null, null];
  if (value == null) return null;
  return (
    <div className="flex shrink-0 flex-col items-end">
      <span className="text-lg font-bold leading-tight tabular-nums text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// Who else is in: up to 3 faces and "+N" (never the viewer — it's My Leagues);
// "Just you" when nobody else has joined.
function MemberFaces({ c, me }: { c: LeagueCard; me?: string }) {
  const others = (c.top_members ?? []).filter((m) => m.user_id !== me);
  const shown = others.slice(0, 3);
  const extra = Math.max(0, c.member_count - 1 - shown.length);
  return (
    <div
      className="flex items-center"
      role="img"
      aria-label={`${c.member_count} member${c.member_count === 1 ? '' : 's'}`}
    >
      {shown.length === 0 ? (
        <span className="text-xs text-muted-foreground">Just you</span>
      ) : (
        <>
          <div className="flex -space-x-1.5">
            {shown.map((m) => (
              <UserAvatar
                key={m.user_id}
                userId={m.user_id}
                name={m.display_name}
                imageUrl={m.avatar_key}
                className="size-6 border-2 border-card"
                fallbackClassName="text-[10px]"
                clickable={false}
              />
            ))}
          </div>
          {extra > 0 && <span className="ms-1.5 text-xs tabular-nums text-muted-foreground">+{extra}</span>}
        </>
      )}
    </div>
  );
}

export default function HomePage() {
  const qc = useQueryClient();
  const router = useRouter();
  const { user } = useAuth();

  const leagues = useQuery({ queryKey: ['leagues'], queryFn: leaguesApi.list });
  const invites = useQuery({ queryKey: ['league-invites'], queryFn: leaguesApi.invites });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['leagues'] });
    qc.invalidateQueries({ queryKey: ['league-invites'] });
  };

  const accept = useMutation({
    mutationFn: (id: string) => leaguesApi.acceptInvite(id),
    onSuccess: () => {
      toast.success('Invite accepted');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = leagues.data ?? [];
  const pendingInvites = invites.data ?? [];
  const [joinOpen, setJoinOpen] = useState(false);

  return (
    <div className="container py-5 sm:py-8">
      {/* Header — the mobile page title lives in the navbar. */}
      <h1 className="mb-6 hidden text-2xl font-bold tracking-tight text-foreground lg:block">My Leagues</h1>

      {/* A failed invites fetch would otherwise just hide the section silently. */}
      {invites.isError && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="size-4 shrink-0 text-destructive" />
            Couldn&apos;t load your invites.
          </span>
          <Button size="sm" variant="ghost" onClick={() => invites.refetch()} disabled={invites.isFetching}>
            {invites.isFetching ? 'Retrying…' : 'Retry'}
          </Button>
        </div>
      )}

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <span className="flex size-6 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Inbox className="size-3.5" />
            </span>
            Invites ({pendingInvites.length})
          </h2>
          <div className="flex flex-col gap-3">
            {pendingInvites.map((inv) => (
              <Card
                key={inv.invite_id}
                className="relative flex-col gap-3 overflow-hidden p-4 pl-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-primary to-fuchsia-500" />
                <div className="flex min-w-0 items-center gap-3">
                  <LeagueAvatar name={inv.league_name} logoUrl={inv.league_logo} id={inv.league_id} size={40} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{inv.league_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {leagueTypeLabel(inv.league_type)}
                      {inv.inviter_name ? ` · invited by ${inv.inviter_name}` : ''}
                    </div>
                  </div>
                </div>
                <Button size="sm" className="w-full shrink-0 sm:w-auto" onClick={() => accept.mutate(inv.league_id)}>Accept</Button>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* League grid */}
      {leagues.isLoading ? (
        // Skeleton mirrors the real card geometry (same breakpoints, same cover
        // height, same body rows) so nothing shifts when the data lands.
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="gap-2.5 p-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-11 rounded-xl" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <Skeleton className="h-9 w-16" />
              </div>
              <Skeleton className="h-5 w-28 rounded-md" />
            </Card>
          ))}
        </div>
      ) : leagues.isError ? (
        // A failed fetch must never masquerade as "no leagues" — that's
        // indistinguishable from an empty account and hides a real outage.
        <Card className="items-center gap-4 p-6 text-center sm:p-12">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertCircle className="size-8" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">Couldn&apos;t load your leagues</p>
            <p className="text-sm text-muted-foreground">
              {leagues.error instanceof Error && leagues.error.message
                ? leagues.error.message
                : 'Something went wrong. Check your connection and try again.'}
            </p>
          </div>
          <Button variant="outline" onClick={() => leagues.refetch()} disabled={leagues.isFetching}>
            <RefreshCw className={`size-4 ${leagues.isFetching ? 'animate-spin' : ''}`} />
            {leagues.isFetching ? 'Retrying…' : 'Try again'}
          </Button>
        </Card>
      ) : data.length === 0 ? (
        <Card className="items-center gap-4 p-6 text-center sm:p-12">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-fuchsia-500 to-brand text-white shadow-lg">
            <Trophy className="size-8" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">No leagues yet</p>
            <p className="text-sm text-muted-foreground">
              Create a league or join one with a code to start playing.
            </p>
          </div>
          <Button
            onClick={() => router.push('/leagues/new')}
            variant="primary"
            className="bg-gradient-to-r from-primary to-fuchsia-600 shadow-md shadow-primary/20 hover:opacity-90"
          >
            <Plus className="size-4" /> Create your first league
          </Button>
          <Button variant="outline" onClick={() => setJoinOpen(true)}>
            <KeyRound className="size-4" /> Join with code
          </Button>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {data.map((c) => {
            const t = typeIconFor(c.league_type);
            const unread = c.unread_feed_count ?? 0;
            return (
              <Link
                key={c.id}
                href={`/leagues/${c.id}`}
                className="group rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Card className="gap-2.5 p-3 transition-colors group-hover:border-primary/40">
                  {/* Row 1: logo, type icon + name over the member faces, my number. */}
                  <div className="flex items-center gap-3">
                    <LeagueAvatar name={c.name} logoUrl={c.logo_url} id={c.id} size={44} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <t.icon
                          className={`size-3.5 shrink-0 ${t.color}`}
                          role="img"
                          aria-label={leagueTypeLabel(c.league_type)}
                        />
                        <span className="truncate text-base font-semibold text-foreground">{c.name}</span>
                      </div>
                      <MemberFaces c={c} me={user?.id} />
                    </div>
                    <CardStat c={c} />
                  </div>
                  {/* Row 2: the week (or Draft), then new posts, then the chevron. */}
                  <div className="flex items-center gap-2 border-t border-border pt-2.5 text-xs text-muted-foreground">
                    <PeriodBadge status={c.status} period={c.current_period} />
                    <span className="flex-1" />
                    {unread > 0 && (
                      <span className="flex items-center gap-1.5 whitespace-nowrap font-semibold text-primary">
                        <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                        {unread > 99 ? '99+' : unread} new post{unread === 1 ? '' : 's'}
                      </span>
                    )}
                    <ChevronRight className="size-4" aria-hidden />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {data.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => setJoinOpen(true)}>
            <KeyRound className="size-4" /> Join with code
          </Button>
          <Button asChild variant="outline">
            <Link href="/leagues/new">
              <Plus className="size-4" /> Create league
            </Link>
          </Button>
        </div>
      )}
      <JoinCodeSheet open={joinOpen} onOpenChange={setJoinOpen} />
    </div>
  );
}
