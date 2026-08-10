import { Suspense } from 'react';
import { LeagueResults } from '../sections';

// LeagueResults reads the ?week= param via useSearchParams to deep-link a week;
// this config requires a Suspense boundary around that hook.
export default function ResultsPage() {
  return (
    <Suspense fallback={null}>
      <LeagueResults />
    </Suspense>
  );
}
