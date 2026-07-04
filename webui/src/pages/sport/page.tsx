import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { fetchLeagues, type League } from '@/lib/ingestor';
import { useFavorites, toggleFavorite } from '@/lib/favorites';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Star } from 'lucide-react';

export function SportPage() {
  const { slug = '' } = useParams();
  const title = slug.replace(/-/g, ' ');
  const favorites = useFavorites();

  const {
    data: leagues,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['leagues', slug],
    queryFn: () => fetchLeagues(slug),
    enabled: !!slug,
  });

  return (
    <div className="container py-8">
      <Link to="/sports" className="text-sm text-primary hover:underline">
        ← All sports
      </Link>

      <div className="mt-4 mb-6">
        <h1 className="text-2xl font-bold capitalize text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">Pick a league to browse events.</p>
      </div>

      {isError && (
        <div className="mb-4 text-sm text-destructive">
          Couldn’t load leagues: {(error as Error).message}
        </div>
      )}

      {!isLoading && !isError && leagues?.length === 0 && (
        <div className="text-sm text-muted-foreground">No leagues found for this sport.</div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}

        {leagues?.map((league: League) => {
          const isFav = favorites.some(
            (f) => f.sport === slug && f.league === league.slug,
          );
          return (
            <Link
              key={league.id}
              to={`/sports/${slug}/leagues/${league.slug}`}
              className="group relative"
            >
              <button
                type="button"
                aria-label={isFav ? 'Unpin league' : 'Pin league'}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleFavorite({
                    sport: slug,
                    league: league.slug,
                    name: league.name,
                    abbr: league.abbreviation,
                  });
                }}
                className="absolute right-2 top-2 z-10 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Star className={`size-4 ${isFav ? 'fill-yellow-400 text-yellow-400' : ''}`} />
              </button>

              <Card className="min-h-24 cursor-pointer flex-row items-center gap-3 p-4 transition-all group-hover:border-primary group-hover:shadow-md sm:gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground">
                  {league.logo ? (
                    <img
                      src={league.logo}
                      alt=""
                      className="size-10 object-contain"
                      loading="lazy"
                      onError={(e) => {
                        // ESPN occasionally 404s a logo we cached as valid;
                        // hide the broken image so the abbr fallback shows.
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.parentElement?.replaceChildren(
                          league.abbreviation ?? league.slug.slice(0, 3).toUpperCase(),
                        );
                      }}
                    />
                  ) : (
                    (league.abbreviation ?? league.slug.slice(0, 3).toUpperCase())
                  )}
                </div>
                <div className="min-w-0 pe-6">
                  <div className="truncate font-medium text-foreground">{league.name}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    {league.currentSeason && <span>Season {league.currentSeason}</span>}
                    {league.isTournament && (
                      <Badge variant="primary" size="sm" appearance="light">
                        Tournament
                      </Badge>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
