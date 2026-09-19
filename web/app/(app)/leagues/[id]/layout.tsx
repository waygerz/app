'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';
import {
  leaguesApi, leagueTypeLabel, ordinal, type LeagueType, type StandingRow,
} from '@/lib/leagues';
import { formatCredits } from '@/lib/wallet';
import { LeagueAvatar } from '@/components/league-avatar';
import { PeriodBadge } from '@/components/period-badge';
import { UserAvatar } from '@/components/user-avatar';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AppSheet } from '@/components/ui/app-sheet';
import { cn } from '@/lib/utils';
import { ChevronRight, Swords, Trophy, UserPlus } from 'lucide-react';
import { LeagueProvider } from './league-context';
import { InviteToLeagueDialog } from './invite-dialog';

const PLAY_TAB: Record<LeagueType, string> = {
  head_to_head: 'Bets',
  pickem: 'Picks',
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The league-type chip: Swords = head-to-head, Trophy = pick'em — matching the
// top bar's type icon and the dashboard league cards.
function LeagueTypeBadge({ type }: { type: LeagueType }) {
  const Icon = type === 'pickem' ? Trophy : Swords;
  return (
    <Badge size="sm" appearance="light">
      <Icon className="size-3.5" />
      {leagueTypeLabel(type)}
    </Badge>
  );
}

function formatRecord(r?: StandingRow) {
  if (!r) return '—';
  return r.pushes ? `${r.wins}–${r.losses}–${r.pushes}` : `${r.wins}–${r.losses}`;
}

export default function LeagueLayout({ children }: { children: ReactNode }) {
  const { id = '' } = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const league = useQuery({ queryKey: ['league', id], queryFn: () => leaguesApi.get(id) });
  // My rank + record for the league row and details. Same cache as the
  // Standings tab's season table, so it's one fetch.
  const standings = useQuery({
    queryKey: ['standings', id],
    queryFn: () => leaguesApi.standings(id),
    enabled: !!league.data && league.data.status !== 'draft',
  });

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
  const [inviteOpen, setInviteOpen] = useState(false);
  // Keep the active tab in view when the route changes.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    navRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [pathname, league.data]);

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
  const members = lg.members.length;
  const rows = standings.data?.standings ?? [];
  const mine = rows.find((r) => String(r.user_id) === String(user?.id ?? ''));

  // Feed (league activity), then Upcoming games + Sports (both money-only), then
  // the play tab (Bets / Picks), then Standings (week results + Overall), Members,
  // Wallet (money-only) and admin. Pick'em drops Upcoming/Sports/Wallet, so
  // its play tab sits right after Feed.
  const tabs = [
    { to: `/leagues/${id}`, label: 'Feed', end: true },
    ...(isMoney ? [{ to: `/leagues/${id}/upcoming`, label: 'Upcoming', end: false }] : []),
    ...(isMoney ? [{ to: `/leagues/${id}/sports`, label: 'Sports', end: false }] : []),
    { to: `/leagues/${id}/play`, label: PLAY_TAB[lg.league_type], end: false },
    { to: `/leagues/${id}/standings`, label: 'Standings', end: false },
    { to: `/leagues/${id}/members`, label: 'Members', end: false },
    ...(isMoney ? [{ to: `/leagues/${id}/activity`, label: 'Wallet', end: false }] : []),
    ...(isCommish ? [{ to: `/leagues/${id}/manage`, label: 'Manage', end: false }] : []),
  ];

  // League row, top line: balance (money), my rank (pick'em) or Draft.
  const topLine = isDraft ? (
    <PeriodBadge status={lg.status} period={lg.current_period} />
  ) : isMoney ? (
    <>
      <span className="text-lg font-bold leading-tight tabular-nums text-foreground">
        {formatCredits(lg.my_balance_cents ?? 0)}
      </span>
      <span className="text-xs text-muted-foreground">balance</span>
    </>
  ) : mine ? (
    <>
      <span className="text-lg font-bold leading-tight tabular-nums text-foreground">{ordinal(mine.rank)}</span>
      <span className="text-xs text-muted-foreground">of {rows.length}</span>
    </>
  ) : (
    <span className="text-lg font-bold leading-tight text-foreground">{plural(members, 'member')}</span>
  );
  // Bottom line: the week, or who's in before the league starts.
  const bottomLine = isDraft ? (
    <span>{plural(members, 'member')} · not started</span>
  ) : lg.current_period ? (
    <PeriodBadge status={lg.status} period={lg.current_period} />
  ) : (
    <span>{plural(members, 'member')}</span>
  );

  const openInvite = () => {
    setInfoOpen(false);
    setInviteOpen(true);
  };
  // A draft league's commissioner needs Activate more than Invite, so the row
  // shows Activate; Invite is always in the details sheet too.
  const activateFirst = isDraft && isCommish;

  const stats: [string, string][] = [
    isMoney
      ? ['Balance', formatCredits(lg.my_balance_cents ?? 0)]
      : ['Rank', mine ? `${ordinal(mine.rank)} of ${rows.length}` : '—'],
    ['Members', String(members)],
    ['Record', formatRecord(mine)],
  ];

  return (
    <div className="container min-w-0 w-full pb-5 pt-2">
      {/* League row: balance / rank on top, the week under it — tapping opens
          league details. Invite (or Activate) on the right. The league's logo,
          type and name ride in the top bar (HeaderLogo). */}
      <div className="flex items-center gap-3 py-2">
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          aria-haspopup="dialog"
          aria-label={`${lg.name} details`}
          className="-ms-2 flex min-w-0 flex-1 flex-col items-start gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60 active:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
        >
          <span className="flex items-baseline gap-1.5">{topLine}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {bottomLine}
            <ChevronRight className="size-3.5" aria-hidden />
          </span>
        </button>
        {activateFirst ? (
          <Button onClick={() => activate.mutate()} disabled={activate.isPending}>
            {activate.isPending ? 'Activating…' : 'Activate'}
          </Button>
        ) : (
          <Button variant="outline" onClick={openInvite}>
            <UserPlus />
            Invite
          </Button>
        )}
      </div>

      {/* League details — a bottom sheet from the league row. The centered
          logo + name is the visible heading. */}
      <AppSheet
        open={infoOpen}
        onOpenChange={setInfoOpen}
        hideHeader
        title={lg.name}
        description={lg.description || 'League details'}
      >
          <div className="flex flex-col items-center gap-4 pb-2 pt-4">
            <LeagueAvatar name={lg.name} logoUrl={lg.logo_url} id={lg.id} size={64} />
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="text-lg font-bold text-foreground">{lg.name}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <LeagueTypeBadge type={lg.league_type} />
                <PeriodBadge status={lg.status} period={lg.current_period} />
              </div>
              {lg.description && (
                <p className="break-words text-sm text-foreground">{lg.description}</p>
              )}
            </div>

            <dl className="grid w-full grid-cols-3 divide-x divide-border rounded-xl border border-border bg-muted/30">
              {stats.map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5 px-3 py-2.5">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-base font-bold tabular-nums text-foreground">{value}</dd>
                </div>
              ))}
            </dl>

            <Button className="w-full" onClick={openInvite}>
              <UserPlus />
              Invite
            </Button>

            {commish && (
              <div className="flex w-full items-center gap-3 border-t border-border pt-4">
                <UserAvatar userId={commish.user_id} name={commish.display_name} imageUrl={commish.avatar_key} className="size-9 shrink-0" />
                <div className="min-w-0 flex-1 text-left leading-tight">
                  <div className="truncate text-sm font-medium text-foreground">{commish.display_name}</div>
                  <div className="text-xs text-muted-foreground">Commissioner</div>
                </div>
              </div>
            )}
          </div>
      </AppSheet>

      <InviteToLeagueDialog
        leagueId={id}
        leagueName={lg.name}
        inviteCode={lg.invite_code}
        members={lg.members}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />

      {/* Underline tab bar, pinned under the fixed top bar; swipes sideways
          when the tabs overflow. Full-bleed so its bottom border spans the column. */}
      <div className="sticky top-[calc(var(--header-height-mobile)+env(safe-area-inset-top))] z-[5] -mx-4 mb-4 border-b border-border bg-background">
        <nav
          ref={navRef}
          aria-label="League sections"
          className="flex gap-5 overflow-x-auto overscroll-x-contain px-4 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((t) => {
            const isActive = t.end
              ? pathname === t.to
              : pathname === t.to || pathname.startsWith(t.to + '/');
            return (
              <Link
                key={t.to}
                href={t.to}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  '-mb-px flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 text-sm font-semibold transition-colors',
                  isActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="min-w-0 w-full">
        <LeagueProvider value={lg}>{children}</LeagueProvider>
      </div>
    </div>
  );
}
