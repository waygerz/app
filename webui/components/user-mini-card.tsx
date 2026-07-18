'use client';

import { type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';

/**
 * Centered "mini card" for a person — avatar over name over a subtitle, with
 * optional inline badge and a row of actions. Adapted from Metronic's
 * CardUserMini; used on /friends and the league Members page.
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
  /** Action buttons shown centered at the bottom of the card. */
  actions?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-1.5 p-5 text-center lg:py-8">
      <UserAvatar
        userId={userId}
        name={name}
        imageUrl={imageUrl}
        className="mb-2 size-20"
        fallbackClassName="text-xl"
      />
      <div className="flex max-w-full items-center justify-center gap-1.5">
        <span className="truncate text-base font-medium text-foreground">{name}</span>
        {badge}
      </div>
      {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
      {actions && <div className="mt-3 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </Card>
  );
}
