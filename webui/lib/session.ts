/** Non-HttpOnly marker set by auth — signals "call /me" without reading JWTs. */
export const SESSION_MARKER = 'waygerz_session';

export function hasSessionMarker(): boolean {
  return document.cookie.split(';').some((c) => c.trim().startsWith(`${SESSION_MARKER}=1`));
}