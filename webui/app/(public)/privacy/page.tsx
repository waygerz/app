import type { Metadata } from 'next';
import Link from 'next/link';
import { PrivacyContent, LEGAL_EFFECTIVE } from '@/components/legal/legal-content';

export const metadata: Metadata = {
  title: 'Privacy Policy · Waygerz',
  description: 'How Waygerz collects, uses, and shares your information.',
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-10 sm:py-14">
      <Link href="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
        ← Waygerz
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Effective {LEGAL_EFFECTIVE}</p>
      </header>
      <PrivacyContent />
      <footer className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
        See also our{' '}
        <Link href="/terms" className="text-primary underline underline-offset-2">
          Terms of Service
        </Link>
        .
      </footer>
    </main>
  );
}
