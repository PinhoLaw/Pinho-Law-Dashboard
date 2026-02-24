import { NextRequest, NextResponse } from 'next/server';

const SESSION_TOKEN = process.env.SESSION_SECRET || 'pl-session-token-v1';
const PUBLIC_PATHS = ['/login', '/api/auth'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  // Check auth cookie
  const authCookie = request.cookies.get('pl-auth');
  if (!authCookie || authCookie.value !== SESSION_TOKEN) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
