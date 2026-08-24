import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME } from '@/lib/constants';

/**
 * Route proxy (Next.js 16 renamed the `middleware` convention to `proxy`)
 * — navigation convenience only.
 *
 * This runs on the edge with no database access, so all it can see is whether
 * a session cookie is *present*. It cannot tell whether that cookie is valid,
 * unexpired, or belongs to an admin.
 *
 * So it does exactly one job: send a visitor with no cookie to the login page
 * instead of letting them load a shell that will fail its data fetch, and send
 * a visitor who has a cookie away from the login page.
 *
 * It is NOT access control. Every protected page and every API route
 * independently calls `requireUser()` / `requireAdmin()`, which re-derives
 * identity and role from the database. Forging this cookie gets an attacker a
 * redirect and nothing else.
 */

const PUBLIC_PATHS = ['/login', '/register'];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (!hasSessionCookie && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Preserve the destination so sign-in returns the user where they meant
    // to go, rather than dumping everyone on the dashboard.
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (hasSessionCookie && isPublic) {
    const url = request.nextUrl.clone();
    // The role is unknown here, so this lands on a neutral route that
    // redirects server-side once the real role is known.
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Everything except API routes (which enforce auth themselves and must
     * return JSON, not a redirect), Next internals, and static assets.
     */
    '/((?!api|_next/static|_next/image|uploads|favicon.ico|robots.txt).*)',
  ],
};
