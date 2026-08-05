'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useProfileDialog } from '@/components/profile-dialog-context';
import { userAvatarFallbackClass, userInitials } from '@/lib/avatar';
import { useMediaSrc } from '@/lib/use-media-src';
import { cn } from '@/lib/utils';

export function UserAvatar({
  userId,
  name,
  imageUrl,
  className,
  fallbackClassName,
  clickable = true,
}: {
  userId: string;
  name: string;
  /** A presigned URL, a members/avatars key (resolved here), or null. */
  imageUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
  /**
   * When true (default) and a profile-dialog provider is in scope, tapping the
   * avatar opens that person's profile. Set false where the avatar already sits
   * inside another click target (a row button, a link, a menu trigger) or is
   * the current user.
   */
  clickable?: boolean;
}) {
  const src = useMediaSrc(imageUrl);
  const profile = useProfileDialog();

  const inner = (
    <>
      {src ? <AvatarImage src={src} alt={name} /> : null}
      <AvatarFallback
        className={cn('border-0 font-semibold', userAvatarFallbackClass(userId), fallbackClassName)}
      >
        {userInitials(name)}
      </AvatarFallback>
    </>
  );

  const interactive = clickable && !!profile && !!userId && userId !== profile.me;
  if (interactive) {
    return (
      <button
        type="button"
        aria-label={`View ${name}'s profile`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          profile?.openProfile({ userId, name, avatarKey: imageUrl });
        }}
        className={cn(
          'inline-flex shrink-0 cursor-pointer rounded-full p-0 outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          className,
        )}
      >
        <Avatar className="size-full">{inner}</Avatar>
      </button>
    );
  }

  return <Avatar className={className}>{inner}</Avatar>;
}
