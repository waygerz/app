'use client';

import { useLeague } from '../league-context';
import { useQuery } from '@tanstack/react-query';
import { leaguesApi } from '@/lib/leagues';
import { formatCredits } from '@/lib/wallet';
import { useAuth } from '@/auth/AuthContext';
import { Card } from '@/components/ui/card';
import { SectionTitle } from '@/components/section-title';
import { CenterCard } from '@/components/ui/center-card';
import { UserAvatar } from '@/components/user-avatar';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy } from 'lucide-react';
import { memberRoleLabel } from './shared';

// ===================== STANDINGS =====================
function formatRecord(wins: number, losses: number, pushes?: number) {
  if (pushes) return `${wins}–${losses}–${pushes}`;
  return `${wins}–${losses}`;
}

export function LeagueStandings() {
  const lg = useLeague();
  const { user } = useAuth();
  const me = String(user?.id ?? '');
  const q = useQuery({ queryKey: ['standings', lg.id], queryFn: () => leaguesApi.standings(lg.id) });
  if (q.isLoading) return <Skeleton className="h-40 rounded-xl" />;
  const rows = q.data?.standings ?? [];
  if (rows.length === 0) {
    return (
      <CenterCard>
        <Trophy className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No standings yet.</p>
      </CenterCard>
    );
  }
  const money = rows[0].balance_cents !== undefined;
  const roleById = new Map(lg.members.map((m) => [String(m.user_id), m.role]));

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle title={`Standings (${rows.length})`} />
      <div className="flex flex-col gap-3">
        {rows.map((r) => {
          const rank = r.rank;
          const isMe = String(r.user_id) === me;
          return (
            <Card
              key={r.user_id}
              className="flex-row items-center gap-2 p-3"
            >
              <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                {rank}
              </div>
              <UserAvatar
                userId={r.user_id}
                name={r.display_name}
                imageUrl={r.avatar_key}
                className="size-14 shrink-0"
                fallbackClassName="text-base"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {r.display_name}
                  {isMe && <span className="font-normal text-muted-foreground"> (you)</span>}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {memberRoleLabel(roleById.get(String(r.user_id)) ?? 'member')}
                </p>
              </div>
              {money ? (
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {formatCredits(r.balance_cents ?? 0)}
                  </p>
                  <p
                    className={cn(
                      'text-xs font-medium',
                      (r.net_cents ?? 0) >= 0 ? 'text-brand' : 'text-destructive',
                    )}
                  >
                    {(r.net_cents ?? 0) >= 0 ? '+' : ''}
                    {formatCredits(r.net_cents ?? 0)} net
                  </p>
                </div>
              ) : (
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold tabular-nums text-foreground">
                    {formatRecord(r.wins, r.losses, r.pushes)}
                  </p>
                  <p className="text-xs text-muted-foreground">W–L</p>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
