import type { Metadata } from 'next';
import Link from 'next/link';
import { TermsContent, LEGAL_EFFECTIVE } from '@/components/legal/legal-content';

export const metadata: Metadata = {
  title: 'Terms of Service · Waygerz',
  description: 'The terms that govern your use of Waygerz.',
};

export default function TermsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-10 sm:py-14">
      <Link href="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
        ← Waygerz
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Effective {LEGAL_EFFECTIVE}</p>
      </header>
      <TermsContent />
      <footer className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
        See also our{' '}
        <Link href="/privacy" className="text-primary underline underline-offset-2">
          Privacy Policy
        </Link>
        .
      </footer>
    </main>
  );
}
