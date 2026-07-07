import { type EspnFight } from '@/lib/espn';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CompetitorLogo, EspnStatusBadge } from './shared';

// One MMA card -> its list of two-sided fights.
export function FightCard({ fights }: { fights: EspnFight[] }) {
  if (!fights.length) {
    return (
      <Card className="items-center p-8 text-center">
        <p className="text-sm text-muted-foreground">Bout order not announced yet.</p>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {fights.map((f, i) => (
        <Card key={f.id ?? i} className="gap-2 p-4">
          <div className="flex items-center justify-between gap-2">
            {f.weight_class && (
              <Badge size="sm" appearance="light" variant="secondary">{f.weight_class}</Badge>
            )}
            <EspnStatusBadge status={f.status} />
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <Corner c={f.a} won={f.winner_id != null && f.a.id === f.winner_id} align="end" />
            <span className="text-xs font-semibold text-muted-foreground">vs</span>
            <Corner c={f.b} won={f.winner_id != null && f.b.id === f.winner_id} align="start" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function Corner({
  c,
  won,
  align,
}: {
  c: EspnFight['a'];
  won: boolean;
  align: 'start' | 'end';
}) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${align === 'end' ? 'flex-row-reverse text-right' : ''}`}>
      <CompetitorLogo src={c.logo} name={c.short_name || c.name} size={32} />
      <span className={`min-w-0 truncate text-sm ${won ? 'font-bold text-foreground' : 'font-medium text-foreground'}`}>
        {c.name}
        {won && ' 🏆'}
      </span>
    </div>
  );
}
