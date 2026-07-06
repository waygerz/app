import { redirect } from 'next/navigation';

// /bets has no content of its own — send to the default filter (replaces the
// old react-router <Navigate to="/bets/pending" replace />).
export default function BetsIndexPage() {
  redirect('/bets/pending');
}
