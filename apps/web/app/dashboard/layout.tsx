import Link from 'next/link';
import type { ReactNode } from 'react';

import { NAV } from '../../src/nav';

/** Coach web dashboard shell. Sections register themselves in src/nav.ts. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 220px) 1fr', minHeight: '100vh' }}>
      <nav aria-label="Dashboard" style={{ borderRight: '1px solid var(--line)', padding: '24px 16px', display: 'grid', alignContent: 'start', gap: 4 }}>
        <span className="label" style={{ padding: '0 8px 12px' }}>Spotter Coach</span>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="row" style={{ border: 0, padding: '8px', minHeight: 44 }}>
            {n.label}
          </Link>
        ))}
      </nav>
      <main style={{ padding: '24px var(--margin) 64px', maxWidth: 1040 }}>{children}</main>
    </div>
  );
}
