'use client';

import { useState, type ReactNode } from 'react';
import { opponentsLabel, wagerPick, type Wager, type WagerGroup } from '@/lib/wagers';
import { type SportEvent } from '@/lib/ingestor';
import { isFieldSport } from '@/lib/espn';
import { TeamLogo, formatStart } from '@/components/event-card';
import { UserAvatar } from '@/components/user-avatar';
import { useProfileDialog } from '@/components/profile-dialog-context';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Lock } from 'lucide-react';
import { StakeText } from './shared';

function wagerStatusBadge(w: Wager, me?: string) {
  // Labels are the wager status names, with the one exception the viewer cares
  // about: settled bets read "Won" / "Lost" rather than "Settled". Cancelled
  // shows nothing (it sits in its own group).
  switch (w.status) {
    case 'open':
      return <Badge size="sm" variant="secondary" appearance="light">Open</Badge>;
    case 'accepted':
      return <Badge size="sm" variant="secondary" appearance="light">Accepted</Badge>;
    case 'completed':
      return <Badge size="sm" variant="secondary" appearance="light">Completed</Badge>;
    case 'settled': {
      const won = w.winner_user_id === me;
      return (
        <Badge size="sm" variant={won ? 'success' : 'destructive'} appearance="light">
          {won ? 'Won' : 'Lost'}
        </Badge>
      );
    }
    case 'refunded':
      return <Badge size="sm" variant="secondary" appearance="light">Refunded</Badge>;
    case 'declined':
      return <Badge size="sm" variant="secondary" appearance="light">Declined</Badge>;
    default:
      return null;
  }
}

// A terse status indicator: a muted icon standing in for a text label (Locked,
// Cancelled). Hover / screen-reader text still carries the word.
export function StatusIcon({ icon: Icon, label }: { icon: typeof Lock; label: string }) {
  return (
    <span className="flex items-center justify-center text-muted-foreground" title={label} aria-label={label}>
      <Icon className="size-5" />
    </span>
  );
}

// Read-only detail view of an existing wager — matchup + scores, the viewer's
// pick, stake, opponent and outcome. Opened from a ledger row's pick chip or
// settled result. No editing: bets are placed from the Schedule tab.
function BetDetailsDialog({
  group,
  me,
  ev,
  open,
  onOpenChange,
}: {
  group: WagerGroup;
  me?: string;
  ev?: SportEvent | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const w = group.rep;
  const side = group.viewerSide;
  const field = !!ev && isFieldSport(ev.sport);
  const isTotal = w.bet_type === 'total';
  const settled = w.status === 'settled';
  const decided = settled || w.status === 'completed';
  const iWon = decided && !!w.winner_user_id && w.winner_user_id === me;
  const iLost = decided && !!w.winner_user_id && w.winner_user_id !== me;
  const started = !!ev && ev.status !== 'scheduled' && ev.status !== 'cancelled';
  const final = ev?.status === 'final';
  const hs = ev?.home_score ?? null;
  const as = ev?.away_score ?? null;
  const awayLost = final && hs != null && as != null && hs > as;
  const homeLost = final && hs != null && as != null && as > hs;
  const betTypeLabel = w.bet_type === 'moneyline' ? 'Straight up' : w.bet_type === 'spread' ? 'Spread' : 'Total';
  const opp = group.opponents[0];
  const names = group.opponents.map((o) => o.name);

  // Board grid, same rules as WagerBetCard but at dialog size. (Kept inline
  // rather than shared — the card and the modal are separate surfaces.)
  const spreadLn = w.line != null ? (side === w.proposer_side ? w.line : -w.line) : null;
  const pickForRow = (rowKey: 'home' | 'away'): { label: string; mine: boolean } => {
    if (isTotal) {
      const mine = (rowKey === 'away' && side === 'over') || (rowKey === 'home' && side === 'under');
      return { label: `${rowKey === 'away' ? 'O' : 'U'} ${w.line ?? ''}`.trim(), mine };
    }
    if (w.bet_type === 'spread' && spreadLn != null) {
      const mine = rowKey === side;
      const ln = mine ? spreadLn : -spreadLn;
      return { label: `${ln > 0 ? '+' : ''}${ln}`, mine };
    }
    const mine = rowKey === side;
    return { label: mine ? 'ML' : '', mine };
  };
  const awayPk = pickForRow('away');
  const homePk = pickForRow('home');
  const voided = w.status === 'cancelled' || w.status === 'declined' || w.status === 'refunded';
  const toneBg = iWon ? 'bg-brand/20' : iLost ? 'bg-destructive/20'
    : decided || voided ? 'bg-muted/60' : 'bg-blue-500/20';
  const toneText = iWon ? 'text-brand' : iLost ? 'text-destructive'
    : decided || voided ? 'text-muted-foreground' : 'text-blue-500';
  const resultTone = iWon ? 'text-brand' : iLost ? 'text-destructive' : 'text-muted-foreground';
  const teamBacked = (rowKey: 'home' | 'away') => !isTotal && rowKey === side;
  const rows = [
    { name: ev?.away_team ?? w.away_team, logo: ev?.away_logo ?? null, abbr: ev?.away_abbr ?? w.away_team, score: as, lost: awayLost, pk: awayPk },
    { name: ev?.home_team ?? w.home_team, logo: ev?.home_logo ?? null, abbr: ev?.home_abbr ?? w.home_team, score: hs, lost: homeLost, pk: homePk },
  ];
  const cellBase = 'flex h-12 flex-col items-center justify-center rounded-md text-sm font-semibold leading-tight tabular-nums';
  const teamCls = (backed: boolean) => backed ? toneBg : 'bg-muted/60';
  const pickCls = (mine: boolean) => mine ? cn(toneBg, toneText) : 'bg-muted/60 text-muted-foreground';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="sr-only">{field ? (w.event_name || 'Matchup') : `${w.away_team} @ ${w.home_team}`}</DialogTitle>
        <DialogDescription className="sr-only">Bet details</DialogDescription>

        {/* opponent + outcome header */}
        <div className="flex items-center gap-3">
          {opp && (
            <UserAvatar userId={opp.id} name={opp.name} imageUrl={opp.avatar_key} className="size-11 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-foreground">{opponentsLabel(names)}</div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {group.iAmProposer ? 'You challenged' : 'Challenged you'}
            </div>
          </div>
          <div className="ml-auto shrink-0">
            {decided ? (
              <Badge size="sm" appearance="light" variant={iWon ? 'success' : iLost ? 'destructive' : 'secondary'}>
                {iWon ? 'Won ' : iLost ? 'Lost ' : 'Push'}
                {(iWon || iLost) && <StakeText cents={w.amount_cents} treat={w.treat} sign={iWon ? '+' : '−'} />}
              </Badge>
            ) : (
              wagerStatusBadge(w, me)
            )}
          </div>
        </div>

        <DialogBody className="mt-4 flex flex-col">
          {field ? (
            <div className={cn('rounded-md bg-muted/60 px-3 py-3 text-center text-base font-semibold', iWon ? 'text-brand' : iLost ? 'text-destructive' : 'text-foreground')}>
              {wagerPick(w, side)}
            </div>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_5.5rem] gap-1.5">
              <div className={cn('flex h-12 items-center gap-2.5 rounded-md px-2.5', teamCls(teamBacked('away')))}>
                <TeamLogo src={rows[0].logo} name={rows[0].abbr} size="sm" />
                <span className={cn('min-w-0 flex-1 truncate text-sm', rows[0].lost ? 'text-muted-foreground' : 'font-semibold text-foreground')}>{rows[0].name}</span>
                {started && rows[0].score != null && <span className={cn('text-base font-bold tabular-nums', rows[0].lost ? 'text-muted-foreground' : 'text-foreground')}>{rows[0].score}</span>}
              </div>
              <div className={cn(cellBase, pickCls(awayPk.mine))}>{awayPk.label || '—'}</div>
              <div className="row-span-2 flex flex-col items-center justify-center gap-1 self-stretch rounded-md bg-muted/60 px-1">
                {decided ? (
                  <span className={cn('text-xl font-extrabold tabular-nums', resultTone)}><StakeText cents={w.amount_cents} treat={w.treat} sign={iWon ? '+' : iLost ? '−' : ''} /></span>
                ) : (
                  wagerStatusBadge(w, me)
                )}
              </div>
              <div className={cn('flex h-12 items-center gap-2.5 rounded-md px-2.5', teamCls(teamBacked('home')))}>
                <TeamLogo src={rows[1].logo} name={rows[1].abbr} size="sm" />
                <span className={cn('min-w-0 flex-1 truncate text-sm', rows[1].lost ? 'text-muted-foreground' : 'font-semibold text-foreground')}>{rows[1].name}</span>
                {started && rows[1].score != null && <span className={cn('text-base font-bold tabular-nums', rows[1].lost ? 'text-muted-foreground' : 'text-foreground')}>{rows[1].score}</span>}
              </div>
              <div className={cn(cellBase, pickCls(homePk.mine))}>{homePk.label || '—'}</div>
            </div>
          )}
          <div className="mt-3 text-center text-xs text-muted-foreground">
            {betTypeLabel} · <StakeText cents={w.amount_cents} treat={w.treat} /> stake · {field && w.event_name ? w.event_name : `${w.away_team} @ ${w.home_team}`}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function WagerBetCard({
  group,
  me,
  ev,
  actions,
  leagueName,
}: {
  group: WagerGroup;
  me?: string;
  ev?: SportEvent | null;
  actions?: ReactNode;
  /** Shown on the cross-league /bets page so each card names its league. */
  leagueName?: string;
}) {
  const w = group.rep;
  const side = group.viewerSide;
  const profile = useProfileDialog();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const field = !!ev && isFieldSport(ev.sport);
  const isTotal = w.bet_type === 'total';

  // Opponents line + verb. Once settled the header narrates the outcome.
  const names = group.opponents.map((o) => o.name);
  const settled = w.status === 'settled';
  // The outcome is known once a bet is completed (game final) or settled, so the
  // pick chip + rail can show win/loss even before the payout is confirmed.
  const decided = settled || w.status === 'completed';
  const iWon = decided && !!w.winner_user_id && w.winner_user_id === me;
  const iLost = decided && !!w.winner_user_id && w.winner_user_id !== me;
  const verb = iWon ? 'beat' : iLost ? 'lost to' : 'vs';

  // Game score line. Winner (higher score) stays bright once final; the loser mutes.
  const homeAbbr = ev?.home_abbr ?? w.home_team;
  const awayAbbr = ev?.away_abbr ?? w.away_team;
  const started = !!ev && ev.status !== 'scheduled' && ev.status !== 'cancelled';
  const final = ev?.status === 'final';
  const hs = ev?.home_score ?? null;
  const as = ev?.away_score ?? null;
  const homeLost = final && hs != null && as != null && as > hs;
  const awayLost = final && hs != null && as != null && hs > as;
  const rows = [
    { key: 'away', name: ev?.away_team ?? w.away_team, logo: ev?.away_logo ?? null, abbr: awayAbbr, score: as, lost: awayLost },
    { key: 'home', name: ev?.home_team ?? w.home_team, logo: ev?.home_logo ?? null, abbr: homeAbbr, score: hs, lost: homeLost },
  ];

  // Per-side pick line for the board's "Pick" column: the viewer's side shows
  // their line, highlighted by outcome; the other side shows the opposing line,
  // muted. Totals follow the board convention (Over on away, Under on home).
  const spreadLn = w.line != null ? (side === w.proposer_side ? w.line : -w.line) : null;
  const pickForRow = (rowKey: 'home' | 'away'): { label: string; mine: boolean } => {
    if (isTotal) {
      const mine = (rowKey === 'away' && side === 'over') || (rowKey === 'home' && side === 'under');
      return { label: `${rowKey === 'away' ? 'O' : 'U'} ${w.line ?? ''}`.trim(), mine };
    }
    if (w.bet_type === 'spread' && spreadLn != null) {
      const mine = rowKey === side;
      const ln = mine ? spreadLn : -spreadLn;
      return { label: `${ln > 0 ? '+' : ''}${ln}`, mine };
    }
    const mine = rowKey === side; // moneyline — no number; the side is just marked
    return { label: mine ? 'ML' : '', mine };
  };
  const awayPk = pickForRow('away');
  const homePk = pickForRow('home');

  // One outcome colour, shown as a muted background tint on the backed team cell
  // and the pick cell: green win / red loss / blue in-flight (open, accepted,
  // live) / grey for a settled-neutral push or a voided bet.
  const voided = w.status === 'cancelled' || w.status === 'declined' || w.status === 'refunded';
  const toneBg = iWon ? 'bg-brand/20' : iLost ? 'bg-destructive/20'
    : decided || voided ? 'bg-muted/60' : 'bg-blue-500/20';
  const toneText = iWon ? 'text-brand' : iLost ? 'text-destructive'
    : decided || voided ? 'text-muted-foreground' : 'text-blue-500';
  const resultTone = iWon ? 'text-brand' : iLost ? 'text-destructive' : 'text-muted-foreground';
  const railTone = iWon ? 'bg-brand' : iLost ? 'bg-destructive'
    : decided || voided ? 'bg-muted-foreground/50' : 'bg-blue-500';
  const outcomeTone = toneText;

  // Highlight the team cell the viewer backed (spread / moneyline only).
  const teamBacked = (rowKey: 'home' | 'away') => !isTotal && rowKey === side;
  // Single opponent's name opens their profile; the card opens read-only details.
  const soloOpp = group.opponents.length === 1 ? group.opponents[0] : null;
  const when = ev?.start_time ? formatStart(ev.start_time) : null;
  const cellBase = 'flex h-11 flex-col items-center justify-center rounded-md text-xs font-semibold leading-tight tabular-nums';
  const teamCls = (backed: boolean) =>
    backed ? toneBg : 'bg-muted/60';
  const pickCls = (mine: boolean) =>
    mine ? cn(toneBg, toneText) : 'bg-muted/60 text-muted-foreground';

  // What sits in the tall Result cell: interactive buttons when present, else the
  // net payout once decided, else a live/pending status badge.
  const resultInner = actions ? (
    <div className="flex w-full flex-col items-stretch gap-1" onClick={(e) => e.stopPropagation()}>{actions}</div>
  ) : settled || decided ? (
    <span className={cn('text-base font-extrabold tabular-nums', resultTone)}>
      <StakeText cents={w.amount_cents} treat={w.treat} sign={iWon ? '+' : iLost ? '−' : ''} />
    </span>
  ) : (
    wagerStatusBadge(w, me)
  );

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setDetailsOpen(true)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
            e.preventDefault();
            setDetailsOpen(true);
          }
        }}
        className="-mx-2 cursor-pointer border-b border-border px-2 py-3 last:border-b-0 hover:bg-muted/20 sm:mx-0 sm:px-3"
      >
        {/* caption: state dot + kickoff on the left, opponent + outcome on the right */}
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5 text-xs">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn('size-2 shrink-0 rounded-full', railTone)} />
            <span className="truncate text-muted-foreground">
              {leagueName && <span className="font-medium text-foreground/80">{leagueName} · </span>}
              {when ?? (field && w.event_name ? w.event_name : 'Bet')}
            </span>
          </span>
          <span className={cn('flex shrink-0 items-center gap-1 font-medium', outcomeTone)}>
            {verb}{' '}
            {soloOpp && profile ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  profile.openProfile({ userId: soloOpp.id, name: soloOpp.name, avatarKey: soloOpp.avatar_key });
                }}
                className="underline-offset-2 hover:underline"
              >
                {soloOpp.name}
              </button>
            ) : (
              <span>{opponentsLabel(names)}</span>
            )}
          </span>
        </div>

        {field ? (
          // Field sports (golf, racing) have no home/away matchup — pick is the headline.
          <div className="grid grid-cols-[minmax(0,1fr)_5.25rem] gap-1.5">
            <div className={cn('flex h-11 items-center rounded-md bg-muted/60 px-2.5 text-sm font-semibold', iWon ? 'text-brand' : iLost ? 'text-destructive' : 'text-foreground')}>
              <span className="min-w-0 truncate">{wagerPick(w, side)}</span>
            </div>
            <div className="flex h-11 flex-col items-center justify-center gap-1 rounded-md bg-muted/60 px-1">
              {resultInner}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)_2.75rem_5rem] gap-1.5 sm:grid-cols-[minmax(0,1fr)_3.25rem_5.25rem]">
            {/* away team */}
            <div className={cn('flex h-11 items-center gap-1.5 rounded-md px-2 sm:gap-2 sm:px-2.5', teamCls(teamBacked('away')))}>
              <TeamLogo src={rows[0].logo} name={rows[0].abbr} size="sm" className="size-6 sm:size-8" />
              <span className={cn('min-w-0 flex-1 truncate text-xs sm:text-sm', rows[0].lost ? 'text-muted-foreground' : 'font-medium text-foreground')}>{rows[0].name}</span>
              {started && rows[0].score != null && <span className={cn('text-sm font-bold tabular-nums', rows[0].lost ? 'text-muted-foreground' : 'text-foreground')}>{rows[0].score}</span>}
            </div>
            {/* away pick */}
            <div className={cn(cellBase, pickCls(awayPk.mine))}>{awayPk.label || '—'}</div>
            {/* result — spans both rows */}
            <div className="row-span-2 flex flex-col items-center justify-center gap-1 self-stretch rounded-md bg-muted/60 px-1">
              {resultInner}
            </div>
            {/* home team */}
            <div className={cn('flex h-11 items-center gap-1.5 rounded-md px-2 sm:gap-2 sm:px-2.5', teamCls(teamBacked('home')))}>
              <TeamLogo src={rows[1].logo} name={rows[1].abbr} size="sm" className="size-6 sm:size-8" />
              <span className={cn('min-w-0 flex-1 truncate text-xs sm:text-sm', rows[1].lost ? 'text-muted-foreground' : 'font-medium text-foreground')}>{rows[1].name}</span>
              {started && rows[1].score != null && <span className={cn('text-sm font-bold tabular-nums', rows[1].lost ? 'text-muted-foreground' : 'text-foreground')}>{rows[1].score}</span>}
            </div>
            {/* home pick */}
            <div className={cn(cellBase, pickCls(homePk.mine))}>{homePk.label || '—'}</div>
          </div>
        )}
      </div>

      <BetDetailsDialog group={group} me={me} ev={ev} open={detailsOpen} onOpenChange={setDetailsOpen} />
    </>
  );
}
