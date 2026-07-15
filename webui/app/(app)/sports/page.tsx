'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { fetchSports, type Sport } from '@/lib/ingestor';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { emojiFor } from '@/lib/sport-emoji';

export default function SportsPage() {
  const {
    data: sports,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['sports'], queryFn: fetchSports });

  return (
    <div className="container py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Pick a sport</h1>
        <p className="text-sm text-muted-foreground">
          Choose a sport to browse events and bet your friends.
        </p>
      </div>

      {isError && (
        <div className="mb-4 text-sm text-destructive">
          Couldn’t load sports: {(error as Error).message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {isLoading &&
          Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}

        {sports?.map((sport: Sport) => (
          <Link key={sport.id} href={`/sports/${sport.slug}`} className="group">
            <Card className="h-28 cursor-pointer items-center justify-center gap-2 p-3 text-center transition-all group-hover:border-primary group-hover:shadow-md sm:p-4">
              <span className="text-3xl leading-none sm:text-4xl">{emojiFor(sport.slug)}</span>
              <span className="line-clamp-2 text-xs font-medium text-foreground sm:text-sm">
                {sport.displayName}
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
