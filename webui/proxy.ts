import { NextResponse, type NextRequest } from 'next/server';

// Server-side route protection based on the auth cookies. Replaces the old
// react-router <RequireAuth>/<RequireGuest> guards. The cookies are HttpOnly so
// the browser can't read them, but the proxy runs server-side and can.
//
// We gate on the *refresh* cookie too, not just the 15-min access cookie: the
// middleware can't refresh (that needs the device_uuid held in the browser's
// localStorage), so if we bounced the moment the access cookie expired, a hard
// reload would hit /login even though the session is still renewable. Instead we
// let the request through and the client refreshes (apiFetch's 401 interceptor +
// AuthContext on mount). A genuinely dead session still lands on /login — just
// via the client after a failed refresh.
//
// Only HttpOnly, server-managed cookies belong here — NOT the JS-readable
// `waygerz_session` marker: it's client-forgeable and isn't reliably cleared
// when a refresh fails (e.g. backend unreachable), which would let a dead
// session ping-pong between / and /login.
const SESSION_COOKIES = ['waygerz_access', 'waygerz_refresh'];

// No auth required (shareable deep links).
const PUBLIC_PREFIXES = ['/invite', '/add-friend'];
// Only for signed-OUT users; signed-in users get bounced home.
const GUEST_PREFIXES = ['/login', '/signup', '/welcome'];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = SESSION_COOKIES.some((c) => req.cookies.has(c));

  if (matches(pathname, PUBLIC_PREFIXES)) return NextResponse.next();

  if (matches(pathname, GUEST_PREFIXES)) {
    if (hasSession) return NextResponse.redirect(new URL('/', req.url));
    return NextResponse.next();
  }

  // Root: signed-in users get the app home (their leagues); signed-out visitors
  // see the marketing landing page. Rewrite (not redirect) so the URL stays "/".
  if (pathname === '/') {
    if (hasSession) return NextResponse.next();
    return NextResponse.rewrite(new URL('/welcome', req.url));
  }

  // Everything else requires a session; preserve where they were headed.
  if (!hasSession) {
    const url = new URL('/login', req.url);
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Run on page routes only — skip API, Next internals, static assets, and files.
  matcher: ['/((?!api|_next/static|_next/image|media|favicon.ico|.*\\.).*)'],
};
