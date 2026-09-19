'use client';

import { useEffect, useRef } from 'react';
import { Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WeekChip {
  value: string;
  /** Short label shown on the chip (HF, P1, W2, …). */
  label: string;
  /** Full name, for the tooltip / screen readers ("Preseason Week 1"). */
  title: string;
  /** The season-wide chip (Standings' "Overall"): trophy + a primary outline, so
   *  it doesn't read as another week. */
  overall?: boolean;
}

/**
 * The week picker: a row of small pill buttons (HF, P1, W1, …) that scrolls
 * sideways, with the selected week scrolled into view. Replaces the week
 * dropdowns on Picks and Standings.
 */
export function WeekChips({
  weeks,
  value,
  onChange,
}: {
  weeks: WeekChip[];
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    selected.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [value]);

  return (
    <div
      role="radiogroup"
      aria-label="Week"
      className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max gap-1.5">
        {weeks.map((w) => {
          const on = w.value === value;
          return (
            <button
              key={w.value}
              ref={on ? selected : undefined}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={w.title}
              title={w.title}
              onClick={() => onChange(w.value)}
              className={cn(
                'inline-flex h-8 min-w-10 shrink-0 items-center justify-center gap-1 rounded-full border px-2.5 text-xs font-semibold tabular-nums transition-colors',
                on
                  ? 'border-primary bg-primary text-primary-foreground'
                  : w.overall
                    ? 'border-primary/60 text-primary hover:bg-primary/10'
                    : 'border-input text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {w.overall && <Trophy className="size-3.5" aria-hidden />}
              {w.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
