/** Guard the post-login redirect target against open-redirect abuse. */
export function safeReturnPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}
