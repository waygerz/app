import { leagueColor, leagueInitials } from '@/lib/leagues';

function unreadBadgeLabel(count: number): string {
  if (count > 99) return '99+';
  return String(count);
}

export function LeagueAvatar({
  name,
  logoUrl,
  id,
  size = 56,
  unreadCount = 0,
}: {
  name: string;
  logoUrl: string | null;
  id: string;
  size?: number;
  unreadCount?: number;
}) {
  const style = { width: size, height: size } as const;
  const avatar = logoUrl ? (
    <img
      src={logoUrl}
      alt={name}
      style={style}
      className="shrink-0 rounded-xl object-cover"
    />
  ) : (
    <div
      style={{ ...style, backgroundColor: leagueColor(id) }}
      className="flex shrink-0 items-center justify-center rounded-xl font-bold text-white"
    >
      {leagueInitials(name)}
    </div>
  );

  if (unreadCount <= 0) return avatar;

  return (
    <div className="relative shrink-0" style={style}>
      {avatar}
      <span
        className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background"
        aria-label={`${unreadCount} unread posts`}
      >
        {unreadBadgeLabel(unreadCount)}
      </span>
    </div>
  );
}
