// Pinned sports leagues (the star on /sports/[slug]), stored per user by the
// users service so web and mobile share them. Pins saved in this browser before
// the move (localStorage) are imported once, then cleared.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  usersApi,
  MAX_FAVORITE_LEAGUES,
  type FavoriteLeague,
  type FavoriteLeagueInput,
} from './users';

const QUERY_KEY = ['favorite-leagues'] as const;
const LEGACY_KEY = 'waygerz:favorites';

const same = (f: { sport: string; league: string }, sport: string, league: string) =>
  f.sport === sport && f.league === league;

const toInput = ({ sport, league, name, abbreviation, logo }: FavoriteLeague | FavoriteLeagueInput) => ({
  sport,
  league,
  name,
  abbreviation: abbreviation ?? null,
  logo: logo ?? null,
});

function readLegacy(): FavoriteLeagueInput[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? '[]') as {
      sport?: string;
      league?: string;
      name?: string;
      abbr?: string;
    }[];
    return raw
      .filter((f) => f.sport && f.league && f.name)
      .map((f) => ({ sport: f.sport!, league: f.league!, name: f.name!, abbreviation: f.abbr ?? null, logo: null }));
  } catch {
    return [];
  }
}

async function loadFavorites(): Promise<FavoriteLeague[]> {
  const { favorite_leagues: server } = await usersApi.getFavoriteLeagues();
  const legacy = readLegacy();
  if (!legacy.length) return server;
  // One-time import: append browser-only pins the account doesn't have yet.
  const merged = [
    ...server.map(toInput),
    ...legacy.filter((l) => !server.some((s) => same(s, l.sport, l.league))),
  ].slice(0, MAX_FAVORITE_LEAGUES);
  try {
    const saved = merged.length > server.length ? (await usersApi.saveFavoriteLeagues(merged)).favorite_leagues : server;
    localStorage.removeItem(LEGACY_KEY);
    return saved;
  } catch {
    return server; // keep the local copy and retry the import next load
  }
}

/** The user's pinned leagues plus an optimistic toggle. */
export function useFavoriteLeagues() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: loadFavorites, staleTime: 60_000 });

  const save = useMutation({
    mutationFn: (next: FavoriteLeagueInput[]) =>
      usersApi.saveFavoriteLeagues(next).then((r) => r.favorite_leagues),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<FavoriteLeague[]>(QUERY_KEY);
      qc.setQueryData<FavoriteLeague[]>(
        QUERY_KEY,
        next.map((l, position) => ({ ...l, position })),
      );
      return { prev };
    },
    onError: (err, _next, ctx) => {
      if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev);
      toast.error(err instanceof Error ? err.message : 'Could not update pinned leagues');
    },
    onSuccess: (fresh) => qc.setQueryData(QUERY_KEY, fresh),
  });

  const favorites = query.data ?? [];

  function toggle(fav: FavoriteLeagueInput) {
    if (!query.data) return; // never edit a list we haven't loaded (PUT replaces it)
    const pinned = favorites.some((f) => same(f, fav.sport, fav.league));
    if (!pinned && favorites.length >= MAX_FAVORITE_LEAGUES) {
      toast.error(`You can pin up to ${MAX_FAVORITE_LEAGUES} leagues`);
      return;
    }
    save.mutate(
      pinned
        ? favorites.filter((f) => !same(f, fav.sport, fav.league)).map(toInput)
        : [...favorites.map(toInput), toInput(fav)],
    );
  }

  return {
    favorites,
    isLoading: query.isPending,
    isFavorite: (sport: string, league: string) => favorites.some((f) => same(f, sport, league)),
    toggle,
  };
}
