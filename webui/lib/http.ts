import { API } from './api-paths';
import { getDeviceUuid } from './device';

export type ApiFetchOptions = RequestInit & {
  /** Attach X-Device-UUID (auth refresh/logout). Default true for mutating auth calls only when set by caller. */
  device?: boolean;
  /** Internal: skip the 401 → refresh → retry interceptor (used by the refresh call itself). */
  skipAuthRetry?: boolean;
};

const AUTH_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

// Cross-tab/refresh coordination. Refresh rotates the token and the server
// treats a stale refresh token as reuse (→ hard logout), so we must never fire
// two refreshes at once. Within a tab a single in-flight promise dedups; across
// tabs the Web Locks API serializes (with a localStorage mutex fallback for
// browsers without it), and a shared timestamp skips a redundant refresh when
// another tab just renewed the cookies.
const REFRESH_TS_KEY = 'waygerz_refresh_at';
const REFRESH_LOCK_KEY = 'waygerz_refresh_lock';
const REFRESH_FRESH_MS = 10_000;
const LOCK_STALE_MS = 15_000;
let refreshInFlight: Promise<boolean> | null = null;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The non-HttpOnly marker cookie is present whenever the user has a session. */
function hasSessionMarker(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split('; ').some((c) => c.startsWith('waygerz_session='));
}

function readTs(key: string): number {
  try {
    return Number(localStorage.getItem(key) || 0);
  } catch {
    return 0;
  }
}

async function callRefresh(): Promise<boolean> {
  try {
    const res = await apiFetch(`${AUTH_BASE}${API.auth}/refresh`, {
      method: 'POST',
      body: JSON.stringify({ device_uuid: getDeviceUuid() }),
      device: true,
      skipAuthRetry: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function performRefresh(): Promise<boolean> {
  // Another tab renewed the session moments ago — cookies are already fresh, so
  // retry without a redundant (race-prone) refresh call.
  if (Date.now() - readTs(REFRESH_TS_KEY) < REFRESH_FRESH_MS) return true;
  const ok = await callRefresh();
  if (ok) {
    try {
      localStorage.setItem(REFRESH_TS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }
  return ok;
}

/** Best-effort cross-tab mutex via localStorage, for browsers without Web Locks. */
async function withLocalStorageLock(fn: () => Promise<boolean>): Promise<boolean> {
  const token = `${Date.now()}.${Math.random()}`;
  for (let i = 0; i < 60; i++) {
    let heldAt = 0;
    try {
      heldAt = JSON.parse(localStorage.getItem(REFRESH_LOCK_KEY) || '{}').at || 0;
    } catch {
      heldAt = 0;
    }
    if (Date.now() - heldAt > LOCK_STALE_MS) {
      try {
        localStorage.setItem(REFRESH_LOCK_KEY, JSON.stringify({ token, at: Date.now() }));
      } catch {
        return fn(); // no localStorage available — just run
      }
      await delay(15);
      let owner = '';
      try {
        owner = JSON.parse(localStorage.getItem(REFRESH_LOCK_KEY) || '{}').token || '';
      } catch {
        owner = '';
      }
      if (owner === token) {
        try {
          return await fn();
        } finally {
          try {
            localStorage.removeItem(REFRESH_LOCK_KEY);
          } catch {
            /* ignore */
          }
        }
      }
    }
    await delay(25 + Math.floor(Math.random() * 25));
  }
  return fn(); // couldn't acquire in time — degrade to running
}

async function withCrossTabLock(fn: () => Promise<boolean>): Promise<boolean> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks?.request) return locks.request('waygerz-refresh', fn);
  return withLocalStorageLock(fn);
}

/** Single-flight session refresh, deduped within the tab and across tabs. */
function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = withCrossTabLock(performRefresh).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Fetch with session cookies; optional device header for auth session endpoints. */
export async function apiFetch(url: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { device, skipAuthRetry, headers: extra, ...rest } = options;

  const send = () => {
    const headers = new Headers(extra);
    if (!headers.has('Content-Type') && rest.body) {
      headers.set('Content-Type', 'application/json');
    }
    if (device) {
      headers.set('X-Device-UUID', getDeviceUuid());
    }
    return fetch(url, { ...rest, headers, credentials: 'include' });
  };

  const res = await send();

  // Only an auth-expiry 401 is worth refreshing. Skip: the refresh call itself,
  // SSR, and requests with no session to renew (a logged-out 401 is genuine, and
  // services return 403 — not 401 — for permission failures).
  if (res.status !== 401 || skipAuthRetry || typeof window === 'undefined' || !hasSessionMarker()) {
    return res;
  }
  const refreshed = await refreshSession();
  if (!refreshed) return res;

  const retry = await send();
  if (retry.status === 401) {
    // The (possibly short-circuited) refresh didn't restore access — drop the
    // freshness marker so the next call performs a real refresh instead of
    // trusting a stale timestamp.
    try {
      localStorage.removeItem(REFRESH_TS_KEY);
    } catch {
      /* ignore */
    }
  }
  return retry;
}

export async function apiJson<T>(url: string, options: ApiFetchOptions = {}): Promise<T> {
  const res = await apiFetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}
