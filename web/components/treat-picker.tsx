'use client';

import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// A $0 bragging-rights bet's "treat" — what the loser owes.
export type Treat = 'beer' | 'shot';

const TREATS: { key: Treat; emoji: string; label: string }[] = [
  { key: 'beer', emoji: '🍺', label: 'Beer' },
  { key: 'shot', emoji: '🥃', label: 'Shot' },
];

export const treatEmoji = (t?: Treat | string) => (t === 'shot' ? '🥃' : '🍺');

/**
 * A stake chip that IS the bragging-rights option: shows the chosen treat emoji
 * (no word) and, tapped, opens a reaction-style bar to pick beer or shot — which
 * both sets the treat and selects the $0 bet. Mirrors the post Like control.
 */
export function TreatPicker({
  value,
  selected,
  onPick,
  className,
}: {
  value: Treat;
  /** Whether the bragging-rights bet is the currently-chosen amount. */
  selected: boolean;
  /** Fired when a treat is chosen — set the treat AND select the $0 stake. */
  onPick: (t: Treat) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Bragging rights — loser buys a round"
          aria-pressed={selected}
          className={cn(
            'inline-flex h-9 items-center gap-1 rounded-full border px-3 text-lg leading-none transition-colors',
            selected ? 'border-primary bg-primary/10 text-foreground' : 'border-input text-muted-foreground hover:border-foreground/30',
            className,
          )}
        >
          <span aria-hidden>{treatEmoji(value)}</span>
          <span aria-hidden className="text-[10px] text-muted-foreground">▾</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={8} className="w-auto rounded-full p-1.5">
        <div className="flex items-center gap-0.5">
          {TREATS.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-label={t.label}
              aria-pressed={selected && value === t.key}
              onClick={() => {
                onPick(t.key);
                setOpen(false);
              }}
              className={cn(
                'flex size-11 items-center justify-center rounded-full text-2xl transition hover:scale-125 hover:bg-muted',
                selected && value === t.key && 'bg-primary/15',
              )}
            >
              {t.emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
