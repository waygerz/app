'use client';

import { SURFACES, useColorTheme } from './color-theme';
import { cn } from '@/lib/utils';

/** Dark-mode surface (neutral ground) picker — a mini page/card preview per
 *  option. Only affects dark mode; Slate is the default. */
export function SurfacePicker() {
  const { surface, setSurface } = useColorTheme();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">Dark shade</span>
      <div className="flex flex-wrap gap-3">
        {SURFACES.map((s) => {
          const active = s.key === surface;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSurface(s.key)}
              aria-label={s.label}
              aria-pressed={active}
              title={s.label}
              className="flex flex-col items-center gap-1.5"
            >
              <span
                className={cn(
                  'flex h-11 w-16 items-center justify-center rounded-lg ring-2 ring-offset-2 ring-offset-background transition-shadow',
                  active ? 'ring-foreground' : 'ring-transparent hover:ring-input',
                )}
                style={{ background: s.bg }}
              >
                <span
                  className="h-6 w-10 rounded-md"
                  style={{ background: s.card, border: `1px solid ${s.border}` }}
                />
              </span>
              <span className={cn('text-[11px]', active ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
