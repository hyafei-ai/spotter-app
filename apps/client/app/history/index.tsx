import { Redirect } from 'expo-router';

/** History moved into the Train tab (docs/ux/client-experience.md); old links land there. */
export default function HistoryIndex() {
  return <Redirect href="/train" />;
}
