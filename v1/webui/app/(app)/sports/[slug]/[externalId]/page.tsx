'use client';

import { useParams } from 'next/navigation';
import { isEspnSport } from '@/lib/espn';
import { EspnEventDetail } from '@/components/espn/event-detail';

// Detail for an ESPN sport item (golf tournament / race / fight card / cricket
// match). Sits alongside the static `leagues` segment used by team sports.
export default function SportItemPage() {
  const { slug = '', externalId = '' } = useParams<{ slug: string; externalId: string }>();
  if (!isEspnSport(slug)) {
    return (
      <div className="container py-8 text-sm text-muted-foreground">Not found.</div>
    );
  }
  return <EspnEventDetail sport={slug} externalId={externalId} />;
}
