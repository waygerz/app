'use client';

import { useState, type ReactNode } from 'react';
import { AppSheet } from '@/components/ui/app-sheet';
import { cn } from '@/lib/utils';
import { TermsContent, PrivacyContent, LEGAL_EFFECTIVE } from './legal-content';

type Doc = 'terms' | 'privacy';
const TITLES: Record<Doc, string> = { terms: 'Terms of Service', privacy: 'Privacy Policy' };

/** Shows the Terms or Privacy copy in a scrollable sheet — same source as the
 *  /terms and /privacy pages, so signup links can open it without leaving the
 *  flow. */
export function LegalDialog({
  doc,
  open,
  onOpenChange,
}: {
  doc: Doc;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      tall
      title={TITLES[doc]}
      description={`Effective ${LEGAL_EFFECTIVE}`}
      bodyClassName="flex flex-col gap-4 border-t border-border pt-4"
    >
      {doc === 'terms' ? <TermsContent /> : <PrivacyContent />}
    </AppSheet>
  );
}

/** Inline link that opens the legal dialog. Self-contained open state. */
export function LegalLink({
  doc,
  children,
  className,
}: {
  doc: Doc;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'font-medium text-primary underline underline-offset-2 hover:no-underline',
          className,
        )}
      >
        {children}
      </button>
      <LegalDialog doc={doc} open={open} onOpenChange={setOpen} />
    </>
  );
}
