import { NextResponse, type NextRequest } from 'next/server';

/**
 * Trainer pages on their own hosts (K-6):
 *   maya-reyes-strength.spotter.app/...  → /maya-reyes-strength/...
 *   coach.example.com/...                → /coach.example.com/...  (resolved by custom_domain in public_landing_page)
 * Platform hosts (spotter.app, *.vercel.app, localhost) are left alone. Custom domains are added to the
 * Vercel project as domains; DNS points at Vercel. ROOT_DOMAIN overrides spotter.app.
 */
const ROOT = process.env.ROOT_DOMAIN ?? 'spotter.app';

export function proxy(req: NextRequest) {
  const host = (req.headers.get('host') ?? '').split(':')[0]!.toLowerCase();
  const platform = host === ROOT || host === `www.${ROOT}` || host.endsWith('.vercel.app') || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
  if (platform) return NextResponse.next();

  const sub = host.endsWith(`.${ROOT}`) ? host.slice(0, -(ROOT.length + 1)) : null;
  const key = sub && /^[a-z0-9-]{3,40}$/.test(sub) ? sub : sub ? null : host;
  if (!key) return NextResponse.next();

  const url = req.nextUrl.clone();
  // In-page links already carry the slug (/<slug>/checkout); don't prefix them twice.
  if (url.pathname === `/${key}` || url.pathname.startsWith(`/${key}/`)) return NextResponse.rewrite(url);
  url.pathname = `/${key}${url.pathname === '/' ? '' : url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Never rewrite framework assets, the dashboard or API routes.
  matcher: ['/((?!_next/|dashboard|api/|favicon.ico).*)'],
};
