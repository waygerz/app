'use client';

import { type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';
import { useProfileDialog } from '@/components/profile-dialog-context';

/**
 * Card for a person: the centered vertical "mini card" (Metronic CardUserMini)
 * at every width — avatar on top, then name/subtitle, then actions underneath.
 * Used on /friends and the league Members page, both a 2-col grid (2-up even on
 * phones), so the card never falls back to a horizontal row.
 *
 * Tapping the avatar or name opens that person's profile dialog (details +
 * head-to-head bet history). Your own card isn't clickable.
 */
export function UserMiniCard({
  userId,
  name,
  imageUrl,
  subtitle,
  badge,
  actions,
}: {
  userId: string;
  name: string;
  imageUrl?: string | null;
  /** Handle-equivalent line under the name (e.g. a role). */
  subtitle?: ReactNode;
  /** Small element shown inline next to the name (e.g. a "You" / role badge). */
  badge?: ReactNode;
  /** Message button / actions dropdown — right of the name on mobile, centered under the card on sm+. */
  actions?: ReactNode;
}) {
  const profile = useProfileDialog();
  const canOpen = !!profile && profile.me !== userId;

  return (
    <Card className="flex flex-col items-center gap-1.5 p-4 text-center sm:p-5 lg:py-8">
      <UserAvatar
        userId={userId}
        name={name}
        imageUrl={imageUrl}
        className="mb-2 size-16 shrink-0 sm:size-20"
        fallbackClassName="text-lg sm:text-xl"
      />
      <div className="flex min-w-0 max-w-full flex-col items-center">
        <div className="flex min-w-0 max-w-full items-center gap-1.5">
          {canOpen ? (
            <button
              type="button"
              onClick={() => profile?.openProfile({ userId, name, avatarKey: imageUrl })}
              className="truncate rounded text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:underline sm:text-base"
            >
              {name}
            </button>
          ) : (
            <span className="truncate text-sm font-medium text-foreground sm:text-base">{name}</span>
          )}
          {badge}
        </div>
        {subtitle && <div className="truncate text-xs text-muted-foreground sm:text-sm">{subtitle}</div>}
      </div>
      {actions && (
        <div className="mt-2 flex w-full shrink-0 flex-wrap items-center justify-center gap-2">
          {actions}
        </div>
      )}
    </Card>
  );
}
