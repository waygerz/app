import { Badge } from '@/components/ui/badge';
import { type EspnStatus } from '@/lib/espn';

export function EspnStatusBadge({ status }: { status: EspnStatus }) {
  if (status === 'in_progress') return <Badge variant="destructive" size="sm">LIVE</Badge>;
  if (status === 'final') return <Badge variant="secondary" size="sm">Final</Badge>;
  if (status === 'cancelled') return <Badge variant="outline" size="sm">Cancelled</Badge>;
  return <Badge variant="primary" size="sm" appearance="light">Scheduled</Badge>;
}

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function CompetitorLogo({ src, name, size = 24 }: { src?: string | null; name: string; size?: number }) {
  const style = { width: size, height: size } as const;
  if (!src) {
    return (
      <span
        style={style}
        className="flex shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground"
      >
        {name.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      style={style}
      loading="lazy"
      className="shrink-0 rounded-full object-contain"
      onError={(e) => {
        e.currentTarget.style.display = 'none';
      }}
    />
  );
}
