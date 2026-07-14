'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  leaguesApi,
  leagueTypeLabel,
  type LeagueCard,
} from '@/lib/leagues';
import { formatCredits } from '@/lib/wallet';
import { useAuth } from '@/auth/AuthContext';
import { LeagueAvatar } from '@/components/league-avatar';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Trophy } from 'lucide-react';

function statusLine(c: LeagueCard): string {
  if (c.league_type === 'pickem') return "Pick'em · bragging rights";
  return `${formatCredits(c.my_balance_cents ?? 0)} balance`;
}

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
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          {user ? `Welcome back, ${user.display_name}` : 'Your leagues'}
        </h1>
      </div>

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            Invites ({pendingInvites.length})
          </h2>
          <div className="flex flex-col gap-3">
            {pendingInvites.map((inv) => (
              <Card key={inv.invite_id} className="flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
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
        <Card className="items-center gap-3 p-6 text-center sm:p-10">
          <Trophy className="size-8 text-muted-foreground" />
          <div>
            <p className="text-base font-semibold text-foreground">No leagues yet</p>
            <p className="text-sm text-muted-foreground">
              Create a league or join one with a code to start playing.
            </p>
          </div>
          <Button onClick={() => router.push('/leagues/new')}>
            <Plus className="size-4" /> Create your first league
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c) => (
            <Link key={c.id} href={`/leagues/${c.id}`} className="group">
              <Card className="h-full cursor-pointer flex-row items-center gap-4 p-4 transition-all group-hover:border-primary">
                <LeagueAvatar
                  name={c.name}
                  logoUrl={c.logo_url}
                  id={c.id}
                  unreadCount={c.unread_feed_count ?? 0}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-foreground">{c.name}</span>
                    {c.status === 'draft' && (
                      <Badge size="sm" variant="warning" appearance="light">Draft</Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {leagueTypeLabel(c.league_type)} · {c.member_count} member{c.member_count === 1 ? '' : 's'}
                  </div>
                  <div className="mt-1 text-sm font-medium text-foreground">{statusLine(c)}</div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Create link below the grid (replaces the header button) */}
      {data.length > 0 && (
        <div className="mt-8 text-center">
          <Link
            href="/leagues/new"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <Plus className="size-4" /> Create a league
          </Link>
        </div>
      )}
    </div>
  );
}
