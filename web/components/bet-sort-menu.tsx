'use client';

import { ArrowDownUp } from 'lucide-react';
import type { WagerGroup } from '@/lib/wagers';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Shared sort for bet lists — the global /bets page and the in-league My Bets
// tab render the same icon menu so the two surfaces stay in step.
export type SortKey = 'date-desc' | 'date-asc' | 'stake-desc';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'date-desc', label: 'Newest game' },
  { key: 'date-asc', label: 'Oldest game' },
  { key: 'stake-desc', label: 'Biggest stake' },
];

// Groups are keyed off their representative wager: game date for the date sorts,
// stake for the money sort.
export function sortGroups(groups: WagerGroup[], sort: SortKey): WagerGroup[] {
  const start = (g: WagerGroup) => new Date(g.rep.start_time ?? 0).getTime();
  return [...groups].sort((a, b) =>
    sort === 'stake-desc'
      ? b.rep.amount_cents - a.rep.amount_cents
      : sort === 'date-asc'
        ? start(a) - start(b)
        : start(b) - start(a),
  );
}

// Icon button (matches the 44px search-box height on mobile) opening a radio
// menu of the sort options.
export function BetSortMenu({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Sort bets"
          className="grid size-11 shrink-0 place-items-center rounded-xl border border-input bg-background text-muted-foreground transition-colors hover:text-foreground sm:size-10"
        >
          <ArrowDownUp className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as SortKey)}>
          {SORT_OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.key} value={o.key}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
