'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Check, Search } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchSports, fetchLeagues, fetchTeams, type Sport, type League, type Team } from '@/lib/ingestor';
import { MAX_FAVORITE_TEAMS, type FavoriteTeam, type FavoriteTeamInput } from '@/lib/users';
import { cn } from '@/lib/utils';

const SPORT_EMOJI: Record<string, string> = {
  football: '🏈',
  basketball: '🏀',
  baseball: '⚾',
  hockey: '🏒',
  soccer: '⚽',
};

function normColor(c?: string | null): string | null {
  if (!c) return null;
  return c.startsWith('#') ? c : `#${c}`;
}

function toInput(sportSlug: string, leagueSlug: string, t: Team): FavoriteTeamInput {
  return {
    sport: sportSlug,
    league: leagueSlug,
    external_id: t.external_id,
    name: t.name,
    abbreviation: (t.abbreviation || t.name.slice(0, 3)).toUpperCase(),
    logo: t.logo ?? null,
    color: normColor(t.color),
  };
}

function TeamCell({ t, added, disabled, onClick }: { t: Team; added: boolean; disabled: boolean; onClick: () => void }) {
  const color = normColor(t.color) ?? '#444';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative flex min-h-[92px] flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors',
        added ? 'border-brand bg-brand/10' : 'border-border bg-card hover:bg-muted/50',
        disabled && !added && 'cursor-not-allowed opacity-45',
      )}
    >
      {added && (
        <span className="absolute end-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">
          <Check className="size-2.5" />
        </span>
      )}
      {t.logo ? (
        <img src={t.logo} alt="" className="size-9 rounded-full bg-white object-contain" />
      ) : (
        <span className="grid size-9 place-items-center rounded-full text-xs font-bold text-white" style={{ background: color }}>
          {(t.abbreviation || t.name).slice(0, 3).toUpperCase()}
        </span>
      )}
      <span className="line-clamp-2 text-[11.5px] font-semibold leading-tight">
        {t.name.split(/\s+/).slice(-1)[0] || t.name}
      </span>
    </button>
  );
}

export function TeamPicker({
  open,
  onOpenChange,
  existing,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing: FavoriteTeam[];
  onAdd: (t: FavoriteTeamInput) => void;
}) {
  const [level, setLevel] = useState<'sport' | 'league' | 'team'>('sport');
  const [sport, setSport] = useState<Sport | null>(null);
  const [league, setLeague] = useState<League | null>(null);
  const [q, setQ] = useState('');

  const atMax = existing.length >= MAX_FAVORITE_TEAMS;

  const sportsQ = useQuery({ queryKey: ['sports'], queryFn: fetchSports, enabled: open, staleTime: 5 * 60_000 });
  const leaguesQ = useQuery({
    queryKey: ['leagues', sport?.slug],
    queryFn: () => fetchLeagues(sport!.slug),
    enabled: open && level === 'league' && !!sport,
    staleTime: 5 * 60_000,
  });
  const teamsQ = useQuery({
    queryKey: ['teams', sport?.slug, league?.slug],
    queryFn: () => fetchTeams(sport!.slug, league!.slug),
    enabled: open && level === 'team' && !!sport && !!league,
    staleTime: 5 * 60_000,
  });

  const isAdded = (t: Team) =>
    existing.some((e) => e.sport === sport?.slug && e.league === league?.slug && e.external_id === t.external_id);

  const teams = useMemo(() => {
    const all = teamsQ.data ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter(
      (t) => t.name.toLowerCase().includes(s) || (t.abbreviation ?? '').toLowerCase().includes(s),
    );
  }, [teamsQ.data, q]);

  function reset() {
    setLevel('sport');
    setSport(null);
    setLeague(null);
    setQ('');
  }
  function handleOpenChange(o: boolean) {
    if (!o) reset();
    onOpenChange(o);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="flex max-h-[86svh] flex-col gap-0 rounded-t-2xl p-0">
        <SheetHeader className="flex-row items-center gap-2 space-y-0 border-b px-4 py-3 text-start">
          {level !== 'sport' && (
            <button
              type="button"
              onClick={() => setLevel(level === 'team' ? 'league' : 'sport')}
              className="-ms-1 inline-flex min-h-11 items-center gap-0.5 pe-1 text-sm font-semibold text-primary"
            >
              <ChevronLeft className="size-4" /> Back
            </button>
          )}
          <SheetTitle className="truncate text-base">
            {level === 'sport' ? 'Pick a sport' : level === 'league' ? sport?.name : league?.name}
          </SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {atMax && (
            <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              You&apos;ve reached the max of {MAX_FAVORITE_TEAMS} — remove a team to add another.
            </p>
          )}

          {level === 'sport' &&
            (sportsQ.isPending ? (
              <RowSkeletons />
            ) : (
              <ul className="flex flex-col">
                {(sportsQ.data ?? []).map((s) => (
                  <DrillRow
                    key={s.slug}
                    emoji={SPORT_EMOJI[s.slug]}
                    label={s.name}
                    onClick={() => {
                      setSport(s);
                      setLevel('league');
                    }}
                  />
                ))}
              </ul>
            ))}

          {level === 'league' &&
            (leaguesQ.isPending ? (
              <RowSkeletons />
            ) : (
              <ul className="flex flex-col">
                {(leaguesQ.data ?? []).map((l) => (
                  <DrillRow
                    key={l.slug}
                    label={l.name}
                    onClick={() => {
                      setLeague(l);
                      setQ('');
                      setLevel('team');
                    }}
                  />
                ))}
              </ul>
            ))}

          {level === 'team' && (
            <>
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search teams…"
                  className="h-11 ps-9 text-base"
                />
              </div>
              {teamsQ.isPending ? (
                <div className="grid grid-cols-3 gap-2.5">
                  {[...Array(9)].map((_, i) => (
                    <Skeleton key={i} className="h-[92px] rounded-xl" />
                  ))}
                </div>
              ) : teams.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {(teamsQ.data ?? []).length === 0 ? "No teams available right now." : 'No teams match.'}
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2.5">
                  {teams.map((t) => {
                    const added = isAdded(t);
                    return (
                      <TeamCell
                        key={t.external_id}
                        t={t}
                        added={added}
                        disabled={added || atMax}
                        onClick={() => onAdd(toInput(sport!.slug, league!.slug, t))}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DrillRow({ emoji, label, onClick }: { emoji?: string; label: string; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-[52px] w-full items-center gap-3 border-b border-border px-1 text-start text-[15px] font-semibold last:border-b-0 hover:bg-muted/40"
      >
        {emoji && <span className="w-6 text-center text-xl">{emoji}</span>}
        <span className="flex-1 truncate">{label}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}

function RowSkeletons() {
  return (
    <div className="flex flex-col gap-2 py-1">
      {[...Array(6)].map((_, i) => (
        <Skeleton key={i} className="h-11 w-full rounded-lg" />
      ))}
    </div>
  );
}
