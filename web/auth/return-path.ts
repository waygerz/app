const ORIGIN = 'http://return-path.invalid';

/** Guard the post-login redirect target against open-redirect abuse. */
export function safeReturnPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/')) return '/';
  // Resolve like the browser will: it treats `\` as `/` and strips tabs and
  // newlines, so `/\evil.com` or `/\t/evil.com` would escape a prefix check.
  try {
    const url = new URL(next, ORIGIN);
    if (url.origin !== ORIGIN) return '/';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/';
  }
}
