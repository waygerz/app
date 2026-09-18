/** Non-HttpOnly marker set by auth — signals "call /me" without reading JWTs. */
export const SESSION_MARKER = 'waygerz_session';

/**
 * True when the auth-issued session marker cookie is present (auth sets it to
 * "1" alongside the HttpOnly token cookies). Exact cookie-name match, so a
 * cookie like `waygerz_session_x` never counts. SSR-safe: false without a DOM.
 */
export function hasSessionMarker(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((pair) => {
    const eq = pair.indexOf('=');
    if (eq < 0) return false;
    return pair.slice(0, eq).trim() === SESSION_MARKER && pair.slice(eq + 1).trim() !== '';
  });
}
