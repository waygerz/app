import { type EspnSummary } from '@/lib/espn';
import { Card } from '@/components/ui/card';
import { CompetitorLogo } from './shared';

// A cricket match — home vs away with scores. `winnerId` highlights the winner.
export function MatchCard({ summary }: { summary: EspnSummary }) {
  const { home, away, winner_id } = summary;
  return (
    <Card className="gap-3 p-5">
      <Side name={away?.name ?? 'Away'} logo={away?.logo} score={away?.score} won={!!winner_id && away?.id === winner_id} />
      <div className="border-t border-border" />
      <Side name={home?.name ?? 'Home'} logo={home?.logo} score={home?.score} won={!!winner_id && home?.id === winner_id} />
    </Card>
  );
}

function Side({
  name,
  logo,
  score,
  won,
}: {
  name: string;
  logo?: string | null;
  score?: string | null;
  won: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <CompetitorLogo src={logo} name={name} size={36} />
      <span className={`min-w-0 flex-1 truncate text-base ${won ? 'font-bold text-foreground' : 'font-medium text-foreground'}`}>
        {name}
        {won && ' 🏆'}
      </span>
      {score != null && <span className="shrink-0 text-base font-semibold tabular-nums text-foreground">{score}</span>}
    </div>
  );
}
