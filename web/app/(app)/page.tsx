'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { leaguesApi, leagueTypeLabel } from '@/lib/leagues';
import { LeagueAvatar } from '@/components/league-avatar';
import { UserAvatar } from '@/components/user-avatar';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Trophy, Swords, Inbox, AlertCircle, RefreshCw, type LucideIcon } from 'lucide-react';

// Per-type color accent, matching the landing page: Pick'em = amber, H2H = violet.
const TYPE_ACCENT: Record<string, { bar: string; chip: string; border: string; icon: LucideIcon }> = {
  pickem: {
    bar: 'from-amber-500 to-orange-500',
    chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    border: 'hover:border-amber-500/50',
    icon: Trophy,
  },
  head_to_head: {
    bar: 'from-violet-500 to-fuchsia-500',
    chip: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
    border: 'hover:border-violet-500/50',
    icon: Swords,
  },
};
const accentFor = (t: string) => TYPE_ACCENT[t] ?? TYPE_ACCENT.head_to_head;

export default function HomePage() {
  const qc = useQueryClient();
  const router = useRouter();

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

  return (
    <div className="container py-5 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">My Leagues</h1>
        {data.length > 0 && (
          <Button asChild size="lg" className="h-11 shrink-0">
            <Link href="/leagues/new">
              <Plus className="size-4" /> Create
            </Link>
          </Button>
        )}
      </div>

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
        <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="flex-row items-center gap-4 border border-border p-4 shadow-sm">
              <Skeleton className="size-[72px] rounded-xl" />
              <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                <Skeleton className="h-6 w-2/3" />
                <div className="flex items-center gap-2.5">
                  <Skeleton className="h-6 w-24 rounded-md" />
                  <Skeleton className="h-9 w-24 rounded-full" />
                </div>
              </div>
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
        </Card>
      ) : (
        <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4">
          {data.map((c) => {
            const a = accentFor(c.league_type);
            // Cap the avatar stack so it never spans the whole card on mobile.
            const shownMembers = c.top_members?.slice(0, 3) ?? [];
            const extra = c.member_count - shownMembers.length;
            return (
              <Link key={c.id} href={`/leagues/${c.id}`} className="group">
                <Card className="flex-row items-center gap-4 border border-border p-4 shadow-sm transition-all group-hover:border-primary/40 group-hover:shadow-md">
                  {/* Logo (1.5× the old card): media-resolved, initials fallback. */}
                  <LeagueAvatar name={c.name} logoUrl={c.logo_url} id={c.id} size={72} />

                  {/* Title + social meta: type chip and the member avatar stack. */}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-lg font-bold tracking-tight text-foreground transition-colors group-hover:text-primary sm:text-xl">
                      {c.name}
                    </div>
                    <div className="mt-2 flex items-center gap-2.5">
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium sm:px-2 ${a.chip}`}
                        title={leagueTypeLabel(c.league_type)}
                        aria-label={leagueTypeLabel(c.league_type)}
                      >
                        <a.icon className="size-3.5" />
                        <span className="hidden sm:inline">{leagueTypeLabel(c.league_type)}</span>
                      </span>
                      {shownMembers.length > 0 && (
                        <div className="flex -space-x-2.5">
                          {shownMembers.map((m) => (
                            <UserAvatar
                              key={m.user_id}
                              userId={m.user_id}
                              name={m.display_name}
                              imageUrl={m.avatar_key}
                              className="size-9 border-2 border-card"
                              clickable={false}
                            />
                          ))}
                          {extra > 0 && (
                            <div className="flex size-9 items-center justify-center rounded-full border-2 border-card bg-muted text-[11px] font-semibold text-muted-foreground">
                              +{extra}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: unread posts (prominent) or draft state. */}
                  <div className="flex shrink-0 items-center gap-2">
                    {c.status === 'draft' && (
                      <Badge size="sm" variant="warning" appearance="light">
                        Draft
                      </Badge>
                    )}
                    {(c.unread_feed_count ?? 0) > 0 && (
                      <span
                        className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-extrabold leading-none text-white"
                        title="Unread posts and notices"
                      >
                        {(c.unread_feed_count ?? 0) > 99 ? '99+' : c.unread_feed_count}
                      </span>
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {data.length > 0 && (
        <div className="mt-6 flex justify-center">
          <Button asChild variant="outline" size="lg" className="h-11">
            <Link href="/leagues/new">
              <Plus className="size-4" /> Create league
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
