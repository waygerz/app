// Favorite leagues, stored in localStorage (will move to per-user after auth).
import { useSyncExternalStore } from 'react';

const KEY = 'waygerz:favorites';

export interface FavLeague {
  sport: string;
  league: string;
  name: string;
  abbr?: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function read(): FavLeague[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

// Cached snapshot so useSyncExternalStore gets a stable reference.
let cache: FavLeague[] = read();

function commit(next: FavLeague[]) {
  cache = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

const same = (f: FavLeague, sport: string, league: string) =>
  f.sport === sport && f.league === league;

export function isFavorite(sport: string, league: string) {
  return cache.some((f) => same(f, sport, league));
}

export function toggleFavorite(fav: FavLeague) {
  const exists = cache.some((f) => same(f, fav.sport, fav.league));
  commit(
    exists
      ? cache.filter((f) => !same(f, fav.sport, fav.league))
      : [...cache, fav],
  );
}

function subscribe(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useFavorites(): FavLeague[] {
  return useSyncExternalStore(subscribe, () => cache, () => cache);
}
