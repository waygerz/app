// A share code (/c/<code>) stashed before login and replayed after, so the
// login-page banner can preview it. The actual post-login return rides on the
// ?next= param; this stash only powers the banner.
const STORAGE_KEY = 'waygerz_pending_link';

export interface PendingLink {
  code: string;
}

export function savePendingLink(link: PendingLink): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(link));
  } catch {
    // sessionStorage unavailable (private browsing, etc.)
  }
}

export function readPendingLink(): PendingLink | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingLink>;
    if (parsed.code) return { code: String(parsed.code).toUpperCase() };
  } catch {
    // ignore corrupt storage
  }
  return null;
}

export function clearPendingLink(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function savePendingLinkFromLocation(pathname: string): PendingLink | null {
  if (pathname.startsWith('/c/')) {
    const code = pathname.slice('/c/'.length).split('/')[0].trim().toUpperCase();
    if (!code) return null;
    const link: PendingLink = { code };
    savePendingLink(link);
    return link;
  }
  return null;
}

export function savePendingLinkFromReturnPath(returnPath: string): PendingLink | null {
  if (!returnPath.startsWith('/')) return null;
  const q = returnPath.indexOf('?');
  const pathname = q === -1 ? returnPath : returnPath.slice(0, q);
  return savePendingLinkFromLocation(pathname);
}
