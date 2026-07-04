import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { fetchLeagueEvents, type SportEvent } from '@/lib/ingestor';
import { EventCard } from '@/components/event-card';
import { Skeleton } from '@/components/ui/skeleton';

export function LeaguePage() {
  const { slug = '', league = '' } = useParams();

  const {
    data: events,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['events', slug, league],
    queryFn: () => fetchLeagueEvents(slug, league),
    enabled: !!slug && !!league,
  });

  return (
    <div className="container py-8">
      <Link to={`/sports/${slug}`} className="text-sm text-primary hover:underline">
        ← {slug.replace(/-/g, ' ')}
      </Link>

      <div className="mt-4 mb-6">
        <h1 className="text-2xl font-bold uppercase text-foreground">
          {league.replace(/-/g, ' ')}
        </h1>
        <p className="text-sm text-muted-foreground">Events you can bet on.</p>
      </div>

      {isError && (
        <div className="mb-4 text-sm text-destructive">
          Couldn’t load events: {(error as Error).message}
        </div>
      )}

      {!isLoading && !isError && events?.length === 0 && (
        <div className="text-sm text-muted-foreground">
          No events right now — this league may be between seasons.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        {events?.map((ev: SportEvent) => (
          <EventCard key={ev.id} event={ev} />
        ))}
      </div>
    </div>
  );
}
