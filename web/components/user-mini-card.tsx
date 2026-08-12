'use client';

import { type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';
import { useProfileDialog } from '@/components/profile-dialog-context';

/**
 * Card for a person. On mobile (and any 1-col width) it's a compact horizontal
 * row — avatar, then name/subtitle, then actions on the right. From `lg` up,
 * where /friends and the league Members grid go 2-up, it becomes the centered
 * vertical "mini card" (Metronic CardUserMini). The card's switch matches the
 * grid's so it never renders a full-width vertical card in a single column.
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
  /** Message button / actions dropdown — right of the name on mobile, centered under the card on lg+. */
  actions?: ReactNode;
}) {
  const profile = useProfileDialog();
  const canOpen = !!profile && profile.me !== userId;

  return (
    <Card className="flex flex-row items-center gap-3 p-3 lg:flex-col lg:items-center lg:gap-1.5 lg:p-5 lg:py-8 lg:text-center">
      <UserAvatar
        userId={userId}
        name={name}
        imageUrl={imageUrl}
        className="size-12 shrink-0 lg:mb-2 lg:size-20"
        fallbackClassName="text-lg lg:text-xl"
      />
      <div className="flex min-w-0 flex-1 flex-col lg:max-w-full lg:flex-none lg:items-center">
        <div className="flex min-w-0 max-w-full items-center gap-1.5">
          {canOpen ? (
            <button
              type="button"
              onClick={() => profile?.openProfile({ userId, name, avatarKey: imageUrl })}
              className="truncate rounded text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:underline lg:text-base"
            >
              {name}
            </button>
          ) : (
            <span className="truncate text-sm font-medium text-foreground lg:text-base">{name}</span>
          )}
          {badge}
        </div>
        {subtitle && <div className="truncate text-xs text-muted-foreground lg:text-sm">{subtitle}</div>}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 lg:mt-2 lg:w-full lg:justify-center">
          {actions}
        </div>
      )}
    </Card>
  );
}
