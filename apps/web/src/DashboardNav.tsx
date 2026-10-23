'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV } from './nav';

/** Sidebar on wide screens, a scrolling top bar at phone width (globals.css .dash-nav). Marks the current page. */
export function DashboardNav() {
  const path = usePathname();
  return (
    <nav aria-label="Dashboard" className="dash-nav">
      <span className="label">Spotter Coach</span>
      {NAV.map((n) => {
        const current = n.href === '/dashboard' ? path === n.href : path === n.href || path?.startsWith(`${n.href}/`);
        return (
          <Link key={n.href} href={n.href} className="row" aria-current={current ? 'page' : undefined}>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
