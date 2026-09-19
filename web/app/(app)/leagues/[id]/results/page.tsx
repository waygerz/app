import { redirect } from 'next/navigation';

// Results merged into Standings (week chips + Overall). Keep old links working,
// including a shared ?week=.
export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { id } = await params;
  const { week } = await searchParams;
  redirect(`/leagues/${id}/standings${week ? `?week=${encodeURIComponent(week)}` : ''}`);
}
