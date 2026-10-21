import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="wrap" style={{ padding: '64px var(--margin)', display: 'grid', gap: 12 }}>
      <span className="label">Not found</span>
      <h1>There’s no page here</h1>
      <p className="muted" style={{ margin: 0 }}>
        Check the link you were sent, or ask your coach for their page address.
      </p>
      <div>
        <Link className="btn btn-secondary" href="/">
          Go to Spotter
        </Link>
      </div>
    </main>
  );
}
