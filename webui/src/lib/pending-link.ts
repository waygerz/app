const STORAGE_KEY = 'waygerz_pending_link';

export type PendingLink =
  | { kind: 'invite'; code: string }
  | { kind: 'friend'; userId: string };

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
    if (parsed.kind === 'invite' && parsed.code) {
      return { kind: 'invite', code: String(parsed.code).toUpperCase() };
    }
    if (parsed.kind === 'friend' && parsed.userId) {
      return { kind: 'friend', userId: String(parsed.userId) };
    }
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

export function savePendingLinkFromLocation(pathname: string, search: string): PendingLink | null {
  const params = new URLSearchParams(search);
  if (pathname === '/invite') {
    const code = (params.get('code') || '').trim().toUpperCase();
    if (!code) return null;
    const link: PendingLink = { kind: 'invite', code };
    savePendingLink(link);
    return link;
  }
  if (pathname === '/add-friend') {
    const userId = (params.get('u') || '').trim();
    if (!userId) return null;
    const link: PendingLink = { kind: 'friend', userId };
    savePendingLink(link);
    return link;
  }
  return null;
}

export function savePendingLinkFromReturnPath(returnPath: string): PendingLink | null {
  if (!returnPath.startsWith('/')) return null;
  const q = returnPath.indexOf('?');
  const pathname = q === -1 ? returnPath : returnPath.slice(0, q);
  const search = q === -1 ? '' : returnPath.slice(q);
  return savePendingLinkFromLocation(pathname, search);
}