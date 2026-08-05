'use client';

import { useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { TermsContent, PrivacyContent, LEGAL_EFFECTIVE } from './legal-content';

type Doc = 'terms' | 'privacy';
const TITLES: Record<Doc, string> = { terms: 'Terms of Service', privacy: 'Privacy Policy' };

/** Shows the Terms or Privacy copy in a scrollable dialog — same source as the
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="mb-0 border-b border-border px-6 py-4 text-start">
          <DialogTitle>{TITLES[doc]}</DialogTitle>
          <p className="text-xs text-muted-foreground">Effective {LEGAL_EFFECTIVE}</p>
        </DialogHeader>
        <DialogBody className="min-h-0 p-0">
          <ScrollArea className="h-[min(68vh,620px)]">
            <div className="flex flex-col gap-4 px-6 py-5">
              {doc === 'terms' ? <TermsContent /> : <PrivacyContent />}
            </div>
          </ScrollArea>
        </DialogBody>
      </DialogContent>
    </Dialog>
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
