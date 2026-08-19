import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

// The single empty-state primitive (UI_AUDIT §1.4): a centered Card holding an
// icon on top of a short line of muted text. Compose the children as
// `<Icon className="size-6 text-muted-foreground" /><p>…</p>`. Optional CTA
// links/buttons can follow the text inside the same card.
export function CenterCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Card className={cn('items-center gap-2 p-6 text-center sm:p-10', className)}>{children}</Card>
  );
}
