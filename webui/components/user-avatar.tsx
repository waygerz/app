'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { userAvatarFallbackClass, userInitials } from '@/lib/avatar';
import { useMediaSrc } from '@/lib/use-media-src';
import { cn } from '@/lib/utils';

export function UserAvatar({
  userId,
  name,
  imageUrl,
  className,
  fallbackClassName,
}: {
  userId: string;
  name: string;
  /** A presigned URL, a members/avatars key (resolved here), or null. */
  imageUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
}) {
  const src = useMediaSrc(imageUrl);
  return (
    <Avatar className={className}>
      {src ? <AvatarImage src={src} alt={name} /> : null}
      <AvatarFallback
        className={cn(
          'border-0 font-semibold',
          userAvatarFallbackClass(userId),
          fallbackClassName,
        )}
      >
        {userInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
