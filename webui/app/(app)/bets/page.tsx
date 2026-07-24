import { redirect } from 'next/navigation';

// /bets has no content of its own — send to the default filter (All).
export default function BetsIndexPage() {
  redirect('/bets/all');
}
