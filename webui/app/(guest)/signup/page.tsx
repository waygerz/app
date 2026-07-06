import { redirect } from 'next/navigation';

// Login and signup are one passwordless phone → OTP flow now. Keep /signup as a
// redirect so old links/bookmarks still land on the unified entry (preserving ?next).
export default async function SignupRedirect({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
}
