'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { leaguesApi, leagueTypeLabel } from '@/lib/leagues';
import { formatCredits } from '@/lib/wallet';
import { useAuth } from '@/auth/AuthContext';
import { LeagueAvatar } from '@/components/league-avatar';
import { UserAvatar } from '@/components/user-avatar';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Trophy, Swords, Coins, Inbox, type LucideIcon } from 'lucide-react';

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
  const { user } = useAuth();
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
    <div className="container py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            {user ? (
              <>
                Welcome back,{' '}
                <span className="bg-gradient-to-r from-primary via-fuchsia-500 to-brand bg-clip-text text-transparent">
                  {user.display_name}
                </span>
              </>
            ) : (
              'Your leagues'
            )}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your leagues, invites, and where to jump back in.
          </p>
        </div>
      </div>

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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c) => {
            const a = accentFor(c.league_type);
            const isMoney = c.league_type !== 'pickem';
            return (
              <Link key={c.id} href={`/leagues/${c.id}`} className="group">
                <Card
                  className={`relative h-full flex-col gap-0 overflow-hidden p-0 transition-all group-hover:-translate-y-0.5 group-hover:shadow-lg ${a.border}`}
                >
                  <div className={`h-1.5 w-full bg-gradient-to-r ${a.bar}`} />
                  <div className="flex flex-1 items-center gap-4 p-5">
                    <LeagueAvatar
                      name={c.name}
                      logoUrl={c.logo_url}
                      id={c.id}
                      unreadCount={c.unread_feed_count ?? 0}
                      size={64}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-lg font-semibold text-foreground">{c.name}</span>
                        {c.status === 'draft' && (
                          <Badge size="sm" variant="warning" appearance="light">Draft</Badge>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${a.chip}`}>
                          <a.icon className="size-3" />
                          {leagueTypeLabel(c.league_type)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {c.member_count} member{c.member_count === 1 ? '' : 's'}
                        </span>
                      </div>
                      {isMoney ? (
                        <div className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand">
                          <Coins className="size-3.5" />
                          {formatCredits(c.my_balance_cents ?? 0)}
                        </div>
                      ) : (
                        <div className="mt-2 text-sm font-medium text-muted-foreground">
                          Bragging rights
                        </div>
                      )}
                    </div>
                  </div>
                  {(c.top_members?.length ?? 0) > 0 && (
                    <div className="flex items-center border-t border-border px-5 py-3">
                      <div className="flex -space-x-2">
                        {c.top_members!.map((m) => (
                          <UserAvatar
                            key={m.user_id}
                            userId={m.user_id}
                            name={m.display_name}
                            imageUrl={m.avatar_key}
                            className="size-7 border-2 border-background"
                          />
                        ))}
                        {c.member_count > (c.top_members?.length ?? 0) && (
                          <div className="flex size-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-semibold text-muted-foreground">
                            +{c.member_count - (c.top_members?.length ?? 0)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {data.length > 0 && (
        <div className="mt-6 flex justify-center">
          <Link
            href="/leagues/new"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <Plus className="size-4" /> Create league
          </Link>
        </div>
      )}
    </div>
  );
}
