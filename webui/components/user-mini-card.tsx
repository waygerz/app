'use client';

import { type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';

/**
 * Card for a person. On mobile it's a single horizontal row — avatar, then
 * name/subtitle, then actions on the right. From `sm` up it's the centered
 * vertical "mini card" (Metronic CardUserMini). Used on /friends and the
 * league Members page (paired with a 1-col mobile grid).
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
  return (
    <Card className="flex flex-row items-center gap-3 p-3 sm:flex-col sm:items-center sm:gap-1.5 sm:p-5 sm:text-center lg:py-8">
      <UserAvatar
        userId={userId}
        name={name}
        imageUrl={imageUrl}
        className="size-12 shrink-0 sm:mb-2 sm:size-20"
        fallbackClassName="text-lg sm:text-xl"
      />
      <div className="flex min-w-0 flex-1 flex-col sm:max-w-full sm:flex-none sm:items-center">
        <div className="flex min-w-0 max-w-full items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground sm:text-base">{name}</span>
          {badge}
        </div>
        {subtitle && <div className="truncate text-xs text-muted-foreground sm:text-sm">{subtitle}</div>}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:mt-2 sm:w-full sm:justify-center">
          {actions}
        </div>
      )}
    </Card>
  );
}
