import type { ReactNode } from 'react';

/**
 * A league section's heading: the title, then one muted line of context. Every
 * section uses this so headers look the same everywhere (web and the app's
 * SectionTitle match).
 */
export function SectionTitle({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
