import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { userAvatarFallbackClass, userInitials } from '@/lib/avatar';
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
  imageUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
}) {
  return (
    <Avatar className={className}>
      {imageUrl ? <AvatarImage src={imageUrl} alt={name} /> : null}
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
