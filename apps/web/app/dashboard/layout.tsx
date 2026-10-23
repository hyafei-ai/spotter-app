import type { ReactNode } from 'react';

import { DashboardNav } from '../../src/DashboardNav';

/**
 * Coach web dashboard shell. Sections register themselves in src/nav.ts. At phone width (≤ 640px)
 * the nav collapses into a scrolling top bar and content gets 16px gutters (globals.css .dash).
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dash">
      <DashboardNav />
      <main className="dash-main">{children}</main>
    </div>
  );
}
