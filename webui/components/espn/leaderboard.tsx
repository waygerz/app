import { type EspnCompetitor } from '@/lib/espn';
import { Card } from '@/components/ui/card';
import { CompetitorLogo } from './shared';

// Ranked field for golf (to-par scores) and racing (finishing grid, no score).
export function Leaderboard({ field }: { field: EspnCompetitor[] }) {
  if (!field.length) {
    return (
      <Card className="items-center p-8 text-center">
        <p className="text-sm text-muted-foreground">The field isn’t published yet — check back closer to the start.</p>
      </Card>
    );
  }
  return (
    <Card className="min-w-0 gap-0 overflow-hidden p-0">
      {field.map((c, i) => (
        <div
          key={c.id ?? i}
          className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0"
        >
          <span className="w-8 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-foreground">
            {c.position_display || c.order || i + 1}
          </span>
          <CompetitorLogo src={c.logo} name={c.short_name || c.name} size={28} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{c.name}</span>
          {c.score != null && (
            <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{c.score}</span>
          )}
          {c.winner && (
            <span className="shrink-0 text-xs font-semibold text-amber-500">🏆</span>
          )}
        </div>
      ))}
    </Card>
  );
}
