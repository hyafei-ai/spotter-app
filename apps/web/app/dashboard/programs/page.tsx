import type { Metadata } from 'next';
import { ProgramsClient } from './ProgramsClient';

export const metadata: Metadata = { title: 'Programs · Spotter' };

/** K-4 on the web: the same program model as the coach app, in a table that's faster for bulk edits. */
export default function ProgramsPage() {
  return <ProgramsClient />;
}
