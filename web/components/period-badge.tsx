import { Badge } from '@/components/ui/badge';
import type { LeaguePeriod } from '@/lib/leagues';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A league's current period — "Week 3 · Open" (green dot while open) — or
 * Draft before the league starts. Nothing when there's no period. Used by the
 * league row and the My Leagues cards (app: `periodBadge` in both). */
export function PeriodBadge({ status, period }: { status: string; period: LeaguePeriod | null }) {
  if (status === 'draft') return <Badge size="sm" variant="warning" appearance="light">Draft</Badge>;
  if (!period) return null;
  return (
    <Badge size="sm" variant="secondary" className="tabular-nums">
      {period.status === 'open' && <span className="size-1.5 rounded-full bg-brand" aria-hidden />}
      {period.label} · {cap(period.status)}
    </Badge>
  );
}
