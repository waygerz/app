'use client';

import type { CSSProperties } from 'react';
import type { SportEvent } from '@/lib/ingestor';
import { coverStatus, wagerPick, type Wager, type WagerSide } from '@/lib/wagers';
import { formatCredits } from '@/lib/wallet';
import { formatStart, TeamLogo } from '@/components/event-card';
import { treatEmoji } from '@/components/treat-picker';
import { UserAvatar } from '@/components/user-avatar';
import { cn } from '@/lib/utils';

// The stacked bet card: the viewer's pick as a hero band in their team's color,
// the other player's pick as a slimmer band under it, and a bar with the
// kickoff / live line / result and the stake. Purely presentational — callers
// put the actions (Accept, Counter…) under it. Shared by /c bet links, bet
// details and the notifications sheet; mirrors the app's `BetCard`
// (mobile/lib/widgets/bet_card.dart) — change both together.

const MINE_FALLBACK = '#8b5cf6'; // app primary
const THEIRS_FALLBACK = '#64748b'; // slate

function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return `rgba(100, 116, 139, ${a})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const other = (s: WagerSide): WagerSide =>
  s === 'home' ? 'away' : s === 'away' ? 'home' : s === 'over' ? 'under' : 'over';

const BET_TYPE_LABEL = { spread: 'Spread', moneyline: 'Moneyline', total: 'Over/under' } as const;

/** The card's headline from the viewer's side (the /c bet wording). */
export function betHeadline(w: Wager, me: string): string {
  const iAmProposer = w.proposer_id === me;
  const involved = iAmProposer || w.acceptor_id === me;
  const otherName = iAmProposer ? w.acceptor_name : w.proposer_name;
  const myTurn = w.my_turn ?? (w.status === 'open' && w.pending_id === me);
  const decided = w.status === 'completed' || w.status === 'settled';
  if (!involved) return `${w.proposer_name}'s bet`;
  if (decided) {
    if (!w.winner_user_id) return 'Push';
    return w.winner_user_id === me ? `You beat ${otherName}` : `${otherName} beat you`;
  }
  if (w.status === 'declined') return w.pending_id === me ? 'You declined this bet' : `${otherName} declined`;
  if (w.status === 'cancelled') return 'Bet cancelled';
  if (w.status === 'refunded') return 'Bet refunded';
  if (myTurn) return `${otherName} ${(w.stake_round ?? 0) > 0 ? 'countered your bet' : 'sent you a bet'}`;
  if (w.status === 'accepted') return `You’re on with ${otherName}`;
  return `Waiting on ${otherName}`;
}

export function BetCard({
  wager: w,
  event: ev,
  me,
  headline,
  closeInset = false,
}: {
  wager: Wager;
  event: SportEvent | null;
  /** The viewer's user id. */
  me: string;
  headline?: string;
  /** Leave room on the right of the header for a sheet's floating close button. */
  closeInset?: boolean;
}) {
  const iAmProposer = w.proposer_id === me;
  const involved = iAmProposer || w.acceptor_id === me;
  // An onlooker sees the proposer's side on top.
  const topSide = involved ? (iAmProposer ? w.proposer_side : w.acceptor_side) : w.proposer_side;
  const bottomSide = other(topSide);
  const otherId = iAmProposer || !involved ? w.acceptor_id : w.proposer_id;
  const otherName = iAmProposer || !involved ? w.acceptor_name : w.proposer_name;
  const otherAvatar = iAmProposer || !involved ? w.acceptor_avatar_key : w.proposer_avatar_key;
  const headerId = involved ? otherId : w.proposer_id;
  const headerName = involved ? otherName : w.proposer_name;
  const headerAvatar = involved ? otherAvatar : w.proposer_avatar_key;

  const total = w.bet_type === 'total';
  const hs = ev?.home_score ?? null;
  const as = ev?.away_score ?? null;
  const scored = !!ev && (ev.status === 'live' || ev.status === 'final') && hs != null && as != null;
  const live = ev?.status === 'live';
  const decided = w.status === 'completed' || w.status === 'settled';
  const terminal = w.status === 'declined' || w.status === 'cancelled' || w.status === 'refunded';
  const topWon = decided && !!w.winner_user_id && w.winner_user_id === (involved ? me : w.proposer_id);
  const topLost = decided && !!w.winner_user_id && !topWon;
  const cover = coverStatus(w, topSide, ev);

  const teamName = (s: WagerSide) => (s === 'home' ? ev?.home_team ?? w.home_team : ev?.away_team ?? w.away_team);
  const teamLogo = (s: WagerSide) => (s === 'home' ? ev?.home_logo : ev?.away_logo) ?? null;
  const teamColor = (s: WagerSide) => (s === 'home' ? ev?.home_color : ev?.away_color) ?? null;
  const teamScore = (s: WagerSide) => (s === 'home' ? hs : as);
  const pick = (s: WagerSide) => `${wagerPick(w, s)}${w.bet_type === 'moneyline' ? ' to win' : ''}`;

  const topColor = (!total && teamColor(topSide)) || MINE_FALLBACK;
  const bottomColor = (!total && teamColor(bottomSide)) || THEIRS_FALLBACK;
  const band = (color: string, at: string, strong: number, weak: number): CSSProperties => ({
    backgroundImage: `radial-gradient(120% 160% at ${at}, ${rgba(color, strong)}, ${rgba(color, weak)} 70%)`,
  });

  const state = decided
    ? topWon ? 'WON' : topLost ? 'LOST' : 'PUSH'
    : w.status === 'declined' ? 'DECLINED'
      : w.status === 'cancelled' ? 'CANCELLED'
        : w.status === 'refunded' ? 'REFUNDED'
          : live ? 'LIVE'
            : w.status === 'accepted' ? 'LOCKED IN'
              : (w.my_turn ?? w.pending_id === me) ? 'OFFERED' : 'PENDING';

  // Totals show the game itself under each pick; team bets show it in the logo/score.
  const abbr = (s: 'home' | 'away') => (s === 'home' ? ev?.home_abbr : ev?.away_abbr) || teamName(s);
  const gameLine = scored
    ? `${abbr('away')} ${as} – ${hs} ${abbr('home')}`
    : `${abbr('away')} @ ${abbr('home')} · ${formatStart(ev?.start_time ?? w.start_time)}`;

  const stake = w.amount_cents ? formatCredits(w.amount_cents) : treatEmoji(w.treat);

  return (
    <div className="flex flex-col gap-3">
      <div className={cn('flex items-center gap-3', closeInset && 'pe-10')}>
        <UserAvatar userId={headerId} name={headerName} imageUrl={headerAvatar} className="size-10 shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-foreground">{headline ?? betHeadline(w, me)}</p>
          <p className="truncate text-xs text-muted-foreground">{w.league || 'Head-to-head'}</p>
        </div>
      </div>

      {/* Always dark (like the top bar) so team colors read the same in both themes. */}
      <div className="dark overflow-hidden rounded-2xl border border-border bg-card text-white">
        <div
          className={cn('relative flex min-h-[5.75rem] items-center gap-3 overflow-hidden px-3.5 py-3', topLost && 'brightness-[.7] saturate-[.3]')}
          style={band(topColor, '0% 0%', 0.85, 0.15)}
        >
          {!total && (
            <TeamLogo
              src={teamLogo(topSide)}
              name={teamName(topSide)}
              className="pointer-events-none absolute right-12 top-1/2 size-[5.4rem] -translate-y-1/2 opacity-[.18]"
            />
          )}
          <div className="relative min-w-0 flex-1">
            <p className="text-[11px] font-black tracking-wider text-white/80">
              {involved ? 'YOUR PICK' : w.proposer_name.toUpperCase()} · {state}
            </p>
            <p className="truncate text-2xl font-black tabular-nums tracking-tight">{pick(topSide)}</p>
            {total && <p className="truncate text-xs tabular-nums text-white/75">{gameLine}</p>}
          </div>
          {scored && (
            <span className="relative text-3xl font-black tabular-nums">
              {total ? hs! + as! : teamScore(topSide)}
            </span>
          )}
        </div>

        <div
          className={cn('relative flex items-center gap-3 overflow-hidden border-t border-white/5 px-3.5 py-3', topWon && 'brightness-[.7] saturate-[.3]')}
          style={band(bottomColor, '0% 100%', 0.75, 0.12)}
        >
          {!total && (
            <TeamLogo
              src={teamLogo(bottomSide)}
              name={teamName(bottomSide)}
              className="pointer-events-none absolute right-12 top-1/2 size-[3.75rem] -translate-y-1/2 opacity-[.18]"
            />
          )}
          <div className="relative min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[11px] font-black tracking-wider text-white/80">
              <UserAvatar userId={otherId} name={otherName} imageUrl={otherAvatar} className="size-4" fallbackClassName="text-[7px]" clickable={false} />
              <span className="truncate">{otherName.toUpperCase()}</span>
            </p>
            <p className="truncate text-base font-extrabold tabular-nums">{pick(bottomSide)}</p>
          </div>
          {scored && !total && (
            <span className="relative text-2xl font-black tabular-nums">{teamScore(bottomSide)}</span>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-3.5 py-2.5 text-xs text-muted-foreground">
          {terminal ? (
            <span className="rounded-full bg-muted px-2 py-0.5 font-bold text-muted-foreground">
              {w.status === 'declined' ? 'Declined' : w.status === 'cancelled' ? 'Cancelled' : 'Refunded'}
            </span>
          ) : live ? (
            <>
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 font-bold text-red-400">
                <span className="size-1.5 animate-pulse rounded-full bg-red-400 motion-reduce:animate-none" aria-hidden />
                LIVE
              </span>
              {cover && <span className={cn('font-bold', cover.ok ? 'text-green-400' : 'text-red-400')}>{cover.text}</span>}
            </>
          ) : cover ? (
            <span className={cn('font-bold', cover.ok ? 'text-green-400' : 'text-red-400')}>{cover.text}</span>
          ) : (
            <span className="truncate">
              {formatStart(ev?.start_time ?? w.start_time)} · {BET_TYPE_LABEL[w.bet_type]}
            </span>
          )}
          <span className="flex-1" />
          {decided && w.winner_user_id ? (
            <span className={cn('flex items-baseline gap-1.5 font-bold', topWon ? 'text-green-400' : 'text-red-400')}>
              {topWon ? 'Won' : 'Lost'}
              <span className="text-lg font-black tabular-nums">
                {w.amount_cents ? `${topWon ? '+' : '−'}${stake}` : stake}
              </span>
            </span>
          ) : (
            <span className="flex items-baseline gap-1.5">
              Stake <span className="text-lg font-black tabular-nums text-white">{stake}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
