'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Minus, Plus } from 'lucide-react';
import { AppSheet } from '@/components/ui/app-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/user-avatar';
import { TeamLogo } from '@/components/event-card';
import { TreatPicker, type Treat } from '@/components/treat-picker';
import { cn } from '@/lib/utils';
import { lineForSide, viewerSide, wagersApi, type Wager } from '@/lib/wagers';

const STAKE_PRESETS = [10, 20];

function centsToDollars(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** The line as it reads on the viewer's side: a signed spread, or a bare total. */
function lineStr(betType: string, line: number | null): string {
  if (line == null) return '';
  if (betType === 'total') return String(line);
  return line > 0 ? `+${line}` : `${line}`;
}

/**
 * Counter editor (Option A): your side on top with the original terms kept for
 * reference, the line adjuster beneath (your perspective — the server normalizes
 * it), and the place-a-bet amount row with the beer/shot treat picker.
 */
export function CounterButton({
  wager,
  me,
  onDone,
  className,
}: {
  wager: Wager;
  me: string;
  onDone?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const mySide = viewerSide(wager, me);
  const hasLine = wager.bet_type === 'spread' || wager.bet_type === 'total';
  const isTotal = wager.bet_type === 'total';
  const origLine = lineForSide(wager, mySide);

  // Opponent (the side receiving this counter).
  const iAmProposer = wager.proposer_id === me;
  const otherName = iAmProposer ? wager.acceptor_name : wager.proposer_name;
  const otherId = iAmProposer ? wager.acceptor_id : wager.proposer_id;
  const otherAvatar = iAmProposer ? wager.acceptor_avatar_key : wager.proposer_avatar_key;

  // My side's identity: a team (spread/moneyline) or Over/Under (total).
  const myTeam = mySide === 'home' ? wager.home_team : wager.away_team;
  const myLabel = isTotal ? (mySide === 'over' ? 'Over' : 'Under') : myTeam;

  const [dollars, setDollars] = useState(() => centsToDollars(wager.amount_cents));
  const [line, setLine] = useState<number | null>(() => origLine);
  const [treat, setTreat] = useState<Treat>(() => (wager.treat === 'shot' ? 'shot' : 'beer'));

  const reset = () => {
    setDollars(centsToDollars(wager.amount_cents));
    setLine(origLine);
    setTreat(wager.treat === 'shot' ? 'shot' : 'beer');
  };

  const parsedCents = (() => {
    const n = Number.parseFloat(dollars);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
  })();
  const isBeer = parsedCents === 0;
  const isPreset = STAKE_PRESETS.includes(parsedCents / 100);

  const m = useMutation({
    mutationFn: () =>
      wagersApi.counter(wager.id, {
        amount_cents: parsedCents,
        line: hasLine ? line : null,
        treat: isBeer ? treat : undefined,
      }),
    onSuccess: () => {
      toast.success('Counter sent');
      setOpen(false);
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unchanged =
    parsedCents === wager.amount_cents &&
    (!hasLine || line === origLine) &&
    (parsedCents !== 0 || treat === wager.treat);
  const invalid = Number.isNaN(parsedCents) || (hasLine && line == null);

  const chip = (on: boolean) =>
    cn('inline-flex h-9 items-center justify-center rounded-full border px-4 text-sm font-semibold tabular-nums transition-colors',
      on ? 'border-primary bg-primary/10 text-foreground' : 'border-input text-muted-foreground hover:border-foreground/30');

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={cn('w-full', className)}
        onClick={(e) => {
          e.stopPropagation();
          reset();
          setOpen(true);
        }}
      >
        Counter
      </Button>

      {/* The sheet renders in a portal, but React events still bubble to the
          card behind it — stop them here so a tap doesn't open the card. */}
      <div className="contents" onClick={(e) => e.stopPropagation()}>
        <AppSheet
          open={open}
          onOpenChange={setOpen}
          title={
            <span className="flex min-w-0 items-center gap-3">
              <UserAvatar userId={otherId} name={otherName} imageUrl={otherAvatar} className="size-9 shrink-0" clickable={false} />
              <span className="truncate">{otherName}</span>
            </span>
          }
          description="Countering their bet"
          bodyClassName="flex flex-col gap-4"
          footer={
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={m.isPending}>
                Cancel
              </Button>
              <Button onClick={() => m.mutate()} disabled={m.isPending || invalid || unchanged}>
                {m.isPending ? 'Sending…' : 'Send counter'}
              </Button>
            </div>
          }
        >
            {/* Board: your side on top (original line kept for reference), adjuster beneath. */}
            <div className="flex flex-col gap-1.5">
              <div className="flex h-12 items-center gap-2.5 rounded-md bg-blue-500/15 px-2.5 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.28)]">
                {isTotal ? (
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-[8px] font-bold text-muted-foreground ring-1 ring-border">O/U</span>
                ) : (
                  <TeamLogo src={null} name={myTeam} size="xs" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{myLabel}</span>
                {hasLine && (
                  <span className="shrink-0 rounded-md border border-border bg-black/20 px-2.5 py-1 text-[13px] font-bold tabular-nums text-muted-foreground">
                    {lineStr(wager.bet_type, origLine)}
                  </span>
                )}
              </div>

              {hasLine && (
                <div className="flex h-12 items-center justify-between gap-2 rounded-md bg-muted/60 p-1.5">
                  <button
                    type="button"
                    aria-label={isTotal ? 'Lower the total' : 'Lower the spread'}
                    onClick={() => setLine((v) => (v ?? 0) - 0.5)}
                    className="grid size-9 place-items-center rounded-md border border-border bg-background text-foreground hover:bg-muted"
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className={cn('text-base font-bold tabular-nums', line !== origLine ? 'text-brand' : 'text-foreground')}>
                    {lineStr(wager.bet_type, line)}
                  </span>
                  <button
                    type="button"
                    aria-label={isTotal ? 'Raise the total' : 'Raise the spread'}
                    onClick={() => setLine((v) => (v ?? 0) + 0.5)}
                    className="grid size-9 place-items-center rounded-md border border-border bg-background text-foreground hover:bg-muted"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Amount: beer/shot treat picker + presets + free input. */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">Amount</label>
              <div className="flex flex-wrap items-center gap-2">
                <TreatPicker value={treat} selected={isBeer} onPick={(t) => { setTreat(t); setDollars('0'); }} />
                {STAKE_PRESETS.map((amt) => (
                  <button key={amt} type="button" onClick={() => setDollars(String(amt))} className={chip(!isBeer && parsedCents / 100 === amt)}>
                    ${amt}
                  </button>
                ))}
                <div className={cn('flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-full border px-3',
                  !isBeer && !isPreset && dollars.trim() !== '' ? 'border-primary' : 'border-input')}>
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    value={isBeer ? '' : dollars}
                    onChange={(e) => setDollars(e.target.value.replace(/[^\d.]/g, ''))}
                    inputMode="decimal"
                    placeholder="Amount"
                    aria-label="Stake in dollars"
                    className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                  />
                </div>
              </div>
            </div>
        </AppSheet>
      </div>
    </>
  );
}
