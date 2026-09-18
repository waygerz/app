'use client';

import { useLeague } from '../league-context';
import { useQuery } from '@tanstack/react-query';
import { fetchTransactions, formatCredits, type WalletTxn } from '@/lib/wallet';
import { Card } from '@/components/ui/card';
import { CenterCard } from '@/components/ui/center-card';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, ArrowUpRight, ArrowDownRight, RotateCcw, Flag, type LucideIcon } from 'lucide-react';

// ===================== ACTIVITY =====================
const TXN_LABEL: Record<string, string> = {
  league_grant: 'Starting grant', wager_hold: 'Bet hold', wager_payout: 'Bet payout',
  wager_refund: 'Bet refund',
};

// Icon + tint per transaction type. The chip colour reads the *meaning* of the
// entry (money in = brand green, money out = red, refund = sky, grant = amber),
// not the raw sign — so an unusual or zero entry still looks right.
const TXN_STYLE: Record<string, { Icon: LucideIcon; chip: string }> = {
  wager_payout: { Icon: ArrowUpRight, chip: 'bg-brand/12 text-brand' },
  wager_hold: { Icon: ArrowDownRight, chip: 'bg-destructive/12 text-destructive' },
  wager_refund: { Icon: RotateCcw, chip: 'bg-sky-500/12 text-sky-500' },
  league_grant: { Icon: Flag, chip: 'bg-amber-500/12 text-amber-500' },
};

// "+$40" / "−$25" with a real minus glyph; formatCredits renders the $ + digits.
function signedCredits(cents: number): string {
  return `${cents >= 0 ? '+' : '−'}${formatCredits(Math.abs(cents))}`;
}

function txnDayLabel(d: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Bucket the (newest-first) transactions into calendar days, preserving order
// and tracking each day's net.
function groupTxnsByDay(txns: WalletTxn[]) {
  const groups: { key: string; label: string; net: number; items: WalletTxn[] }[] = [];
  for (const t of txns) {
    const d = new Date(t.created_at);
    const key = d.toDateString();
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: txnDayLabel(d), net: 0, items: [] };
      groups.push(g);
    }
    g.items.push(t);
    g.net += t.amount_cents;
  }
  return groups;
}

// Tiny running-balance sparkline: up to the 12 most recent balances, oldest to
// newest. Heights are normalised to the visible min/max with a 20% floor so a
// flat stretch still reads as bars.
function BalanceSpark({ txns }: { txns: WalletTxn[] }) {
  const pts = txns.slice(0, 12).map((t) => t.balance_after_cents).reverse();
  if (pts.length < 2) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  return (
    <div className="flex h-12 items-end gap-[3px]" aria-hidden>
      {pts.map((v, i) => (
        <span
          key={i}
          className="w-1.5 rounded-sm bg-primary/70"
          style={{ height: `${20 + ((v - min) / span) * 80}%` }}
        />
      ))}
    </div>
  );
}

function TxnRow({ t }: { t: WalletTxn }) {
  const style = TXN_STYLE[t.type] ?? { Icon: Wallet, chip: 'bg-muted text-muted-foreground' };
  const Icon = style.Icon;
  const up = t.amount_cents >= 0;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', style.chip)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">{TXN_LABEL[t.type] ?? t.type}</div>
        <div className="text-xs text-muted-foreground">
          {new Date(t.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </div>
      </div>
      <div className="text-right">
        <div className={cn('text-sm font-bold tabular-nums', up ? 'text-brand' : 'text-destructive')}>
          {signedCredits(t.amount_cents)}
        </div>
        <div className="text-[11px] tabular-nums text-muted-foreground">{formatCredits(t.balance_after_cents)}</div>
      </div>
    </li>
  );
}

export function LeagueActivity() {
  const lg = useLeague();
  const isMoney = lg.league_type !== 'pickem';
  const q = useQuery({
    queryKey: ['wallet-txns', lg.id],
    queryFn: () => fetchTransactions(`league:${lg.id}`),
    enabled: isMoney,
  });
  if (!isMoney) {
    return <CenterCard><Wallet className="size-6 text-muted-foreground" /><p className="text-sm text-muted-foreground">Pick’em leagues don’t use money — see Standings for results.</p></CenterCard>;
  }
  if (q.isLoading) return <Skeleton className="h-40 rounded-xl" />;
  const txns = q.data ?? [];
  if (txns.length === 0) return <CenterCard><Wallet className="size-6 text-muted-foreground" /><p className="text-sm text-muted-foreground">No transactions yet.</p></CenterCard>;

  // txns are newest-first, so [0] holds the current balance.
  const balance = txns[0].balance_after_cents;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekNet = txns
    .filter((t) => new Date(t.created_at).getTime() >= weekAgo)
    .reduce((s, t) => s + t.amount_cents, 0);
  const groups = groupTxnsByDay(txns);

  return (
    <Card className="min-w-0 gap-0 overflow-hidden p-0">
      {/* Balance hero — the answer to "what's my balance, am I up or down?"
          before the line-by-line detail below. */}
      <div className="flex items-start gap-4 border-b border-border p-4 sm:p-5">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">League balance</div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-foreground">{formatCredits(balance)}</div>
          {weekNet !== 0 && (
            <div className={cn('mt-1.5 inline-flex items-center gap-1 text-xs font-semibold', weekNet >= 0 ? 'text-brand' : 'text-destructive')}>
              {weekNet >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {signedCredits(weekNet)} this week
            </div>
          )}
        </div>
        <div className="ml-auto shrink-0">
          <BalanceSpark txns={txns} />
        </div>
      </div>

      {/* Day-grouped timeline with a per-day net. */}
      {groups.map((g) => (
        <div key={g.key}>
          <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</span>
            <span className={cn('text-xs font-bold tabular-nums', g.net >= 0 ? 'text-brand' : 'text-destructive')}>{signedCredits(g.net)}</span>
          </div>
          <ul className="divide-y divide-border">
            {g.items.map((t) => <TxnRow key={t.id} t={t} />)}
          </ul>
        </div>
      ))}
    </Card>
  );
}
