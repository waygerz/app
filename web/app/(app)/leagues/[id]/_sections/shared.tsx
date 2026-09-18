'use client';

import { useState } from 'react';
import { TreatPicker, type Treat } from '@/components/treat-picker';
import { formatCredits } from '@/lib/wallet';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ---- Standard state colors for betting / results cards ----
// selection (your pick) = primary · win = brand green · loss/push = muted · idle = unselected
export const STATE = {
  selected: 'border-primary bg-primary/10 text-foreground',
  win: 'border-brand bg-brand/10 text-foreground',
  loss: 'border-border bg-muted/40 text-muted-foreground',
  idle: 'border-input text-muted-foreground hover:border-foreground/30',
} as const;

export const pickBtn = (selected: boolean) =>
  `rounded-lg border text-sm transition-colors ${selected ? STATE.selected : STATE.idle}`;

// Amount step: quick-pick stake chips. The first chip is the beer bet — no
// money, just pride and a round for the loser 🍺 — which the backend accepts as
// valid, skipping the wallet and the league min/max. Then dollar presets, and a
// "Custom" chip that reveals a free-type field for any other amount. Replaces
// the old always-on amount input.
const STAKE_PRESETS = [10, 20];

export function StakeChips({
  credits,
  onPick,
  treat,
  onTreat,
}: {
  credits: string;
  onPick: (v: string) => void;
  treat: Treat;
  onTreat: (t: Treat) => void;
}) {
  const val = Number(credits);
  const brag = credits.trim() !== '' && val === 0;
  const isPreset = STAKE_PRESETS.includes(val);
  const [customOpen, setCustomOpen] = useState(false);
  // Custom is active when the chip was tapped, or when the current stake is a
  // real amount that isn't the beer or a preset (e.g. reopening an edited bet).
  const custom = customOpen || (credits.trim() !== '' && !brag && !isPreset);
  const chip = (on: boolean) =>
    cn('inline-flex items-center justify-center rounded-full border font-semibold tabular-nums transition-colors',
      on ? STATE.selected : STATE.idle);
  const pick = (v: string) => { setCustomOpen(false); onPick(v); };
  return (
    <div className="flex flex-col gap-2">
      <Label>Amount</Label>
      <div className="flex items-center gap-2">
        {/* Bragging-rights chip: a beer/shot picker (no word). Choosing a treat
            both sets it and selects the $0 stake. */}
        <TreatPicker value={treat} selected={brag} onPick={(t) => { setCustomOpen(false); onTreat(t); onPick('0'); }} />
        {STAKE_PRESETS.map((amt) => {
          const on = !custom && val === amt;
          return (
            <button
              key={amt}
              type="button"
              aria-pressed={on}
              onClick={() => pick(String(amt))}
              className={cn(chip(on), 'px-4 py-2 text-sm')}
            >
              ${amt}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={custom}
          aria-label="Custom amount"
          onClick={() => { setCustomOpen(true); onPick(''); }}
          className={cn(chip(custom), 'px-4 py-2 text-sm')}
        >
          $
        </button>
        {/* Custom amount input appears inline, to the right of the $ chip. */}
        {custom && (
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            autoFocus
            placeholder="Amount"
            value={credits}
            onChange={(e) => onPick(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-full"
          />
        )}
      </div>
    </div>
  );
}

// A sportsbook-style bet card: the matchup and score on the left, the viewer's
// pick and its action on the right, the opponents (folded when a bet went to
// several friends) and stake across the top. Takes a WagerGroup so one card can
// stand for a batch — Cancel / Confirm then act on every sibling at once.
// A beer bet (no money, loser buys the round) renders as the beer glass in place
// of a dollar figure on the compact cards; real stakes render the signed amount.
// The loser's-treat emoji for a $0 bragging bet.
const treatEmoji = (treat?: string) => (treat === 'shot' ? '🥃' : '🍺');

export function StakeText({ cents, sign, treat }: { cents: number; sign?: string; treat?: string }) {
  if (cents === 0) {
    return <span role="img" aria-label="Bragging rights — loser buys the round" className="inline-block align-[-0.1em] text-[2.2em] leading-none">{treatEmoji(treat)}</span>;
  }
  return (
    <>
      {sign ?? ''}
      {formatCredits(cents)}
    </>
  );
}

// The full stake phrase for the bet-confirmation summary: a bragging bet shows the
// treat emoji + "(loser buys the round)"; a real stake is the play-money amount.
export function StakeSummary({ cents, treat }: { cents: number; treat?: string }) {
  if (cents === 0) {
    return (
      <span className="inline-flex items-center gap-1">
        <span aria-hidden>{treatEmoji(treat)}</span>
        <span className="text-muted-foreground">(loser buys the round)</span>
      </span>
    );
  }
  return <>{formatCredits(cents)}</>;
}

const MEMBER_ROLE_LABELS: Record<string, string> = {
  commissioner: 'Commish',
  member: 'Member',
  moderator: 'Moderator',
};

export function memberRoleLabel(role: string) {
  return MEMBER_ROLE_LABELS[role] ?? role.charAt(0).toUpperCase() + role.slice(1);
}
