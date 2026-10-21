'use client';

import dynamic from 'next/dynamic';

/** The table reads this browser's saved programs, so it only renders in the browser. */
export const ProgramsClient = dynamic(() => import('./ProgramTable').then((m) => m.ProgramTable), {
  ssr: false,
  loading: () => <p className="muted">Loading programs…</p>,
});
