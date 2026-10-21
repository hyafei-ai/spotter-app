import Link from 'next/link';

/** Platform root. Trainer pages live at /[slug]; the coach dashboard at /dashboard. */
export default function Home() {
  return (
    <main className="wrap" style={{ paddingTop: 64, display: 'grid', gap: 16 }}>
      <span className="label">Spotter</span>
      <h1>Your coaching, your app.</h1>
      <p className="muted" style={{ maxWidth: 560 }}>
        Spotter gives independent trainers their own branded app, a coach app to run the business from a phone, and a page that sells their coaching.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link className="btn btn-primary" href="/dashboard">Open the coach dashboard</Link>
        <Link className="btn btn-secondary" href="/maya-reyes-strength">See a trainer page</Link>
      </div>
    </main>
  );
}
