'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, Minus, Plus } from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatCredits } from '@/lib/wallet';
import { lineForSide, viewerSide, wagersApi, type Wager, type WagerSide } from '@/lib/wagers';

// Quick stake chips (dollars) offered next to the free input.
const STAKE_CHIPS = [5, 10, 25, 50, 100];

function centsToDollars(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** The pick label for a side at a given (caller-perspective) line — used in the
 * live "was → now" preview inside the editor. */
function pickLabel(w: Wager, side: WagerSide, line: number | null): string {
  if (w.bet_type === 'total') {
    return `${side === 'over' ? 'Over' : 'Under'} ${line ?? ''}`.trim();
  }
  const team = side === 'home' ? w.home_team : w.away_team;
  if (w.bet_type === 'spread' && line != null) {
    return `${team} ${line > 0 ? `+${line}` : line}`;
  }
  return team;
}

/**
 * Counter editor for an open head-to-head bet: change the stake (and, for a
 * spread/total, the line) and send it back. The line stepper works in the
 * VIEWER's own perspective (what they see on their card); the client submits that
 * number and the server normalizes it to proposer-perspective.
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

  const [dollars, setDollars] = useState(() => centsToDollars(wager.amount_cents));
  const [line, setLine] = useState<number | null>(() => lineForSide(wager, mySide));

  const reset = () => {
    setDollars(centsToDollars(wager.amount_cents));
    setLine(lineForSide(wager, mySide));
  };

  const parsedCents = (() => {
    const n = Number.parseFloat(dollars);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
  })();

  const m = useMutation({
    mutationFn: () =>
      wagersApi.counter(wager.id, {
        amount_cents: parsedCents,
        line: hasLine ? line : null,
      }),
    onSuccess: () => {
      toast.success('Counter sent');
      setOpen(false);
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unchanged =
    parsedCents === wager.amount_cents && (!hasLine || line === lineForSide(wager, mySide));
  const invalid = Number.isNaN(parsedCents) || (hasLine && line == null);

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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Counter this bet</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            {/* Stake */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">Stake</label>
              <div className="flex items-center gap-2">
                <span className="text-base text-muted-foreground">$</span>
                <Input
                  value={dollars}
                  onChange={(e) => setDollars(e.target.value.replace(/[^\d.]/g, ''))}
                  inputMode="decimal"
                  className="h-11 flex-1 text-base"
                  aria-label="Stake in dollars"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {STAKE_CHIPS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDollars(String(c))}
                    className="rounded-full border border-input px-3 py-1 text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    ${c}
                  </button>
                ))}
              </div>
            </div>

            {/* Line (spread / total) */}
            {hasLine && (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-foreground">
                  {wager.bet_type === 'total' ? 'Total' : 'Spread'}
                </label>
                <div className="flex items-center justify-between rounded-md bg-muted/60 p-1.5">
                  <button
                    type="button"
                    aria-label="Lower the line"
                    onClick={() => setLine((v) => (v ?? 0) - 0.5)}
                    className="grid size-9 place-items-center rounded-md bg-background text-foreground"
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="text-base font-semibold tabular-nums text-foreground">
                    {pickLabel(wager, mySide, line)}
                  </span>
                  <button
                    type="button"
                    aria-label="Raise the line"
                    onClick={() => setLine((v) => (v ?? 0) + 0.5)}
                    className="grid size-9 place-items-center rounded-md bg-background text-foreground"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </div>
            )}

            {/* was → now */}
            <div className="flex items-center justify-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{formatCredits(wager.amount_cents)}</span>
              <ArrowRight className="size-3.5 text-muted-foreground" />
              <span className="font-semibold text-foreground">
                {Number.isNaN(parsedCents) ? '—' : formatCredits(parsedCents)}
              </span>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={m.isPending}>
              Cancel
            </Button>
            <Button onClick={() => m.mutate()} disabled={m.isPending || invalid || unchanged}>
              {m.isPending ? 'Sending…' : 'Send counter'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
