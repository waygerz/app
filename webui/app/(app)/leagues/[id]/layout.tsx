'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { leaguesApi, leagueTypeLabel, type LeagueType } from '@/lib/leagues';
import { LeagueAvatar } from '@/components/league-avatar';
import { UserAvatar } from '@/components/user-avatar';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { LeagueInviteDialog } from './invite-dialog';
import { LeagueProvider } from './league-context';

const PLAY_TAB: Record<LeagueType, string> = {
  head_to_head: 'My Bets',
  pickem: 'Picks',
};

export default function LeagueLayout({ children }: { children: ReactNode }) {
  const { id = '' } = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const league = useQuery({ queryKey: ['league', id], queryFn: () => leaguesApi.get(id) });

  const activate = useMutation({
    mutationFn: () => leaguesApi.activate(id),
    onSuccess: () => {
      toast.success('League activated');
      qc.invalidateQueries({ queryKey: ['league', id] });
      qc.invalidateQueries({ queryKey: ['leagues'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [infoOpen, setInfoOpen] = useState(false);

  if (league.isLoading) {
    return <div className="container min-w-0 w-full py-8"><Skeleton className="h-40 rounded-xl" /></div>;
  }
  if (league.isError || !league.data) {
    return (
      <div className="container min-w-0 w-full py-8">
        <Card className="items-center gap-2 p-8 text-center">
          <p className="text-sm text-muted-foreground">League not found.</p>
          <Button variant="outline" onClick={() => router.push('/')}>Back to dashboard</Button>
        </Card>
      </div>
    );
  }

  const lg = league.data;
  const isCommish = lg.my_role === 'commissioner';
  const isDraft = lg.status === 'draft';
  const isMoney = lg.league_type !== 'pickem';
  const commish = lg.members.find((m) => m.role === 'commissioner');

  const tabs = [
    { to: `/leagues/${id}`, label: 'Overview', end: true },
    { to: `/leagues/${id}/play`, label: PLAY_TAB[lg.league_type], end: false },
    { to: `/leagues/${id}/results`, label: 'Results', end: false },
    { to: `/leagues/${id}/standings`, label: 'Standings', end: false },
    { to: `/leagues/${id}/members`, label: 'Members', end: false },
    ...(isMoney ? [{ to: `/leagues/${id}/activity`, label: 'Activity', end: false }] : []),
    ...(isCommish ? [{ to: `/leagues/${id}/manage`, label: 'Manage', end: false }] : []),
  ];

  return (
    <div className="container min-w-0 w-full py-8">
      {/* Header — stacks on mobile (action under the title), row on desktop */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className="shrink-0 rounded-full transition-opacity hover:opacity-80"
            aria-label="League details"
          >
            <LeagueAvatar name={lg.name} logoUrl={lg.logo_url} id={lg.id} size={56} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-foreground sm:text-2xl">{lg.name}</h1>
              <Badge size="sm" appearance="light">{leagueTypeLabel(lg.league_type)}</Badge>
              {isDraft && <Badge size="sm" variant="warning" appearance="light">Draft</Badge>}
            </div>
            <p className="mt-1 break-words text-xs text-muted-foreground sm:text-sm">
              {lg.members.length} member{lg.members.length === 1 ? '' : 's'}
              {lg.current_period ? ` · ${lg.current_period.label} (${lg.current_period.status})` : ''}
            </p>
          </div>
        </div>
        {isDraft && isCommish && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <Button className="w-full sm:w-auto" onClick={() => activate.mutate()} disabled={activate.isPending}>
              {activate.isPending ? 'Activating…' : 'Activate league'}
            </Button>
          </div>
        )}
      </div>

      {/* League details dialog — opened by tapping the logo. Holds the big logo,
          details, commissioner, and the Invite action. */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent>
          <DialogHeader className="sr-only">
            <DialogTitle>{lg.name} details</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col items-center gap-4 py-2">
            <LeagueAvatar name={lg.name} logoUrl={lg.logo_url} id={lg.id} size={112} />
            <div className="flex flex-col items-center gap-1.5 text-center">
              <h2 className="text-lg font-bold text-foreground">{lg.name}</h2>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Badge size="sm" appearance="light">{leagueTypeLabel(lg.league_type)}</Badge>
                {isDraft && <Badge size="sm" variant="warning" appearance="light">Draft</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                {lg.members.length} member{lg.members.length === 1 ? '' : 's'}
                {lg.current_period ? ` · ${lg.current_period.label} (${lg.current_period.status})` : ''}
              </p>
            </div>

            {lg.description && (
              <p className="w-full break-words text-center text-sm text-foreground">{lg.description}</p>
            )}

            <div className="w-full rounded-lg border border-border p-3">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Commissioner</span>
              <div className="mt-2 flex items-center gap-3">
                {commish && (
                  <UserAvatar userId={commish.user_id} name={commish.display_name} className="size-9 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {commish?.display_name ?? '—'}
                </span>
                <Badge size="sm" appearance="light">Commish</Badge>
              </div>
            </div>

            <div className="w-full">
              <LeagueInviteDialog
                leagueName={lg.name}
                joinCode={lg.join_code}
                isCommish={isCommish}
                leagueId={lg.id}
                memberIds={lg.members.map((m) => m.user_id)}
                onInvitesSent={() => qc.invalidateQueries({ queryKey: ['league', id] })}
              />
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Tab bar scrolls independently — scroll wrapper is NOT the flex row */}
      <div className="mb-6 w-full min-w-0 border-b border-border">
        <div
          className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="League sections"
        >
          <nav className="flex w-max min-w-full gap-1">
            {tabs.map((t) => {
              const isActive = t.end
                ? pathname === t.to
                : pathname === t.to || pathname.startsWith(t.to + '/');
              return (
                <Link
                  key={t.to}
                  href={t.to}
                  className={cn(
                    '-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'border-primary font-medium text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="min-w-0 w-full">
        <LeagueProvider value={lg}>{children}</LeagueProvider>
      </div>
    </div>
  );
}
