'use client';

import { type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';

/**
 * Card for a person. Horizontal on mobile (avatar beside the name, actions
 * below) to stay compact; the centered vertical "mini card" (Metronic
 * CardUserMini) from `sm` up. Used on /friends and the league Members page.
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
  /** Action buttons — beside/below on mobile, centered under the card on sm+. */
  actions?: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-3 p-3 sm:items-center sm:gap-1.5 sm:p-5 sm:text-center lg:py-8">
      <div className="flex min-w-0 items-center gap-3 sm:flex-col sm:gap-1.5">
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
          {subtitle && <div className="text-xs text-muted-foreground sm:text-sm">{subtitle}</div>}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:mt-2 sm:justify-center">{actions}</div>
      )}
    </Card>
  );
}
