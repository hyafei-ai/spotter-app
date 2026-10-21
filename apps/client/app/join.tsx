import { Redirect, useLocalSearchParams } from 'expo-router';

/** Invite links open /join?t=…&tenant=…&e=…; the welcome screen reads the same params. */
export default function Join() {
  const params = useLocalSearchParams<Record<string, string>>();
  const qs = Object.entries(params)
    .filter(([, v]) => typeof v === 'string')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return <Redirect href={`/welcome${qs ? `?${qs}` : ''}`} />;
}
