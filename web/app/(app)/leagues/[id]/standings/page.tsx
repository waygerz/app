import { Suspense } from 'react';
import { LeagueStandings } from '../sections';

// LeagueStandings reads the ?week= param via useSearchParams to deep-link a week
// (or `overall`); this config requires a Suspense boundary around that hook.
export default function StandingsPage() {
  return (
    <Suspense fallback={null}>
      <LeagueStandings />
    </Suspense>
  );
}
