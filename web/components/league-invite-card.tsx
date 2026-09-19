import type { LeagueCodePreview } from '@/lib/invites';
import { leagueTypeLabel } from '@/lib/leagues';
import { formatCredits } from '@/lib/wallet';
import { LeagueAvatar } from '@/components/league-avatar';
import { Badge } from '@/components/ui/badge';

function periodLabel(p: LeagueCodePreview): string {
  const r = (p.rules || {}) as { season_year?: number | string; week_starts_on?: string };
  if (p.period_type === 'season') return `Season${r.season_year ? ` ${r.season_year}` : ''}`;
  return `Weekly${r.week_starts_on ? ` · resets ${r.week_starts_on}` : ''}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-0">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

/** A league's invite preview — logo, name, type, members, commissioner,
 * description and settings. Presentational; the /c page and the notifications
 * sheet put their own Join / Decline under it. The app's `LeagueInviteCard`
 * (mobile/lib/widgets/league_invite_card.dart) mirrors it. */
export function LeagueInviteCard({ league: lg }: { league: LeagueCodePreview }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <LeagueAvatar name={lg.name} logoUrl={lg.logo_url} id={lg.id} size={88} />
        <div>
          <h2 className="text-2xl font-bold text-foreground">{lg.name}</h2>
          <div className="mt-1 flex items-center justify-center gap-2">
            <Badge size="sm" appearance="light">{leagueTypeLabel(lg.league_type)}</Badge>
            <span className="text-xs text-muted-foreground">
              {lg.member_count} member{lg.member_count === 1 ? '' : 's'}
            </span>
          </div>
          {lg.commissioner_name && (
            <p className="mt-2 text-sm text-muted-foreground">
              Invited by <span className="font-medium text-foreground">{lg.commissioner_name}</span>
            </p>
          )}
        </div>
      </div>

      {lg.description && <p className="rounded-lg bg-muted/50 p-3 text-sm text-foreground">{lg.description}</p>}

      <div className="flex flex-col">
        <Row label="Period" value={periodLabel(lg)} />
        {lg.league_type !== 'pickem' && (
          <Row label="Starting balance" value={formatCredits(lg.starting_balance_cents ?? 0)} />
        )}
        {lg.min_wager_cents != null && <Row label="Min wager" value={formatCredits(lg.min_wager_cents)} />}
        {lg.max_wager_cents != null && <Row label="Max wager" value={formatCredits(lg.max_wager_cents)} />}
        {lg.sports.length > 0 && (
          <Row label="Sports" value={lg.sports.map((s) => s.name || s.sport_league_id).join(', ')} />
        )}
      </div>
    </div>
  );
}
