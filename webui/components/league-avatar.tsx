'use client';

import { useQuery } from '@tanstack/react-query';
import { leagueColor, leagueInitials } from '@/lib/leagues';
import { mediaApi } from '@/lib/media';

function unreadBadgeLabel(count: number): string {
  if (count > 99) return '99+';
  return String(count);
}

// A stored league logo is an S3 object key (e.g. "members/leagues/ab/uuid.webp");
// resolve it to a short-lived presigned URL. Direct URLs (data:, blob:, http)
// — used for previews and legacy inline logos — pass through untouched.
function useLogoSrc(logoUrl: string | null): string | null {
  const isKey = !!logoUrl && logoUrl.startsWith('members/');
  const q = useQuery({
    queryKey: ['media-resolve', logoUrl],
    queryFn: () => mediaApi.resolve(logoUrl as string),
    enabled: isKey,
    staleTime: 50 * 60_000, // presigned GET lives 60m — refresh before it expires
    gcTime: 55 * 60_000,
    retry: 1,
  });
  if (!logoUrl) return null;
  if (!isKey) return logoUrl;
  return q.data ?? null;
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
  const src = useLogoSrc(logoUrl);
  const avatar = src ? (
    <img
      src={src}
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
