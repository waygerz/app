import { NextResponse, type NextRequest } from 'next/server';

// Server-side route protection based on the auth cookie. Replaces the old
// react-router <RequireAuth>/<RequireGuest> guards. The cookie is HttpOnly so
// the browser can't read it, but the proxy runs server-side and can.
const AUTH_COOKIE = 'waygerz_access';

// No auth required (shareable deep links).
const PUBLIC_PREFIXES = ['/invite', '/add-friend'];
// Only for signed-OUT users; signed-in users get bounced home.
const GUEST_PREFIXES = ['/login', '/signup', '/welcome'];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has(AUTH_COOKIE);

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
