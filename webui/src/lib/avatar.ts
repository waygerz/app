/** Stable per-user avatar fallback colors (derived from user id). */

export function userInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

const FALLBACK_STYLES = [
  'text-destructive bg-destructive/10',
  'text-primary bg-primary/10',
  'text-amber-600 bg-amber-600/10 dark:text-amber-400 dark:bg-amber-400/10',
  'text-green-600 bg-green-600/10 dark:text-green-400 dark:bg-green-400/10',
  'text-blue-600 bg-blue-600/10 dark:text-blue-400 dark:bg-blue-400/10',
  'text-violet-600 bg-violet-600/10 dark:text-violet-400 dark:bg-violet-400/10',
  'text-rose-600 bg-rose-600/10 dark:text-rose-400 dark:bg-rose-400/10',
  'text-teal-600 bg-teal-600/10 dark:text-teal-400 dark:bg-teal-400/10',
] as const;

export function userAvatarFallbackClass(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return FALLBACK_STYLES[h % FALLBACK_STYLES.length];
}