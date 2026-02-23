import { NextRequest, NextResponse } from 'next/server';

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Skip auth for login page, auth API, static assets
  if (
    path === '/login' ||
    path === '/api/auth' ||
    path.startsWith('/_next') ||
    path.startsWith('/favicon') ||
    path.endsWith('.ico') ||
    path.endsWith('.png') ||
    path.endsWith('.svg')
  ) {
    return NextResponse.next();
  }

  // Check for session cookie existence (iron-session sets this cookie)
  const sessionCookie = req.cookies.get('pinholaw-session');

  if (!sessionCookie?.value) {
    if (!path.startsWith('/api/')) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Cookie exists — let the route handler do the full session validation
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
