'use client';

import { HUES, useColorTheme, type Hue } from './color-theme';
import { cn } from '@/lib/utils';

function Swatches({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Hue;
  onChange: (hue: Hue) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-2.5">
        {HUES.map((hue) => {
          const active = hue.key === value;
          return (
            <button
              key={hue.key}
              type="button"
              onClick={() => onChange(hue.key)}
              aria-label={hue.label}
              aria-pressed={active}
              title={hue.label}
              className={cn(
                'size-8 rounded-full ring-2 ring-offset-2 ring-offset-background transition-shadow',
                hue.dot,
                active
                  ? 'ring-foreground'
                  : 'ring-transparent hover:ring-input',
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Two rows of ROYGBIV swatches for the primary and accent colors. */
export function ColorPicker() {
  const { primary, accent, setPrimary, setAccent } = useColorTheme();
  return (
    <div className="flex flex-col gap-5">
      <Swatches label="Primary" value={primary} onChange={setPrimary} />
      <Swatches label="Accent" value={accent} onChange={setAccent} />
    </div>
  );
}
