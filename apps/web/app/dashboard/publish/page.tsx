'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  REJECTION_GUIDANCE,
  STORE_LABEL,
  STORE_STATUSES,
  STORE_STATUS_LABEL,
  StoreCredentialUpload,
  applyBrand,
  canSubmit,
  descriptionTemplate,
  privacyAnswers,
  publishChecklist,
  publishReadiness,
  screenshotPlan,
  unfilledPlaceholders,
  type Store,
  type StoreStatus,
} from '@spotter/core';
import { sha256Fingerprint } from '../../../src/publishing/image';
import { TENANT, usePublish, useSavedBrand, withStatus, type PublishData } from '../../../src/publishing/storage';
import s from '../../../src/publishing/publishing.module.css';

const STATUS_COLOR: Record<StoreStatus, string> = {
  draft: 'var(--ink2)',
  building: 'var(--brand)',
  in_review: 'var(--warning)',
  live: 'var(--success)',
  rejected: 'var(--error)',
};

const STATUS_DETAIL: Record<StoreStatus, string> = {
  draft: 'Not submitted yet.',
  building: 'Building your app. This usually takes 15–30 minutes.',
  in_review: 'Waiting for the store’s review, usually one to a few days.',
  live: 'Live. Clients can download it.',
  rejected: 'Not approved yet. See what to fix below.',
};

/** MOCK rejection messages for the demo's "Rejected" state, worded like the stores' own notes. */
const DEMO_REJECTION: Record<Store, { code: string; message: string }> = {
  ios: { code: 'login_required', message: 'We were unable to sign in with the demo account provided.' },
  android: { code: 'data_safety', message: 'Your Data safety form does not match the data your app collects.' },
};

/** W-2/W-3/W-4: store keys, listing kit, submission status and leaving the platform. */
export default function PublishPage() {
  const brand = useSavedBrand();
  const pub = usePublish();
  const [notice, setNotice] = useState<string | null>(null);

  if (!pub.loaded || !brand.loaded) {
    return (
      <div aria-busy="true">
        <h2>Publish</h2>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const tenant = applyBrand(TENANT, brand.value);
  const p = pub.value;
  const description = p.description ?? descriptionTemplate(tenant);
  const readiness = publishReadiness(p, brand.value, description);
  const steps = publishChecklist(p);
  const update = (patch: Partial<PublishData>) => pub.save({ ...pub.value, ...patch });

  const submit = (store: Store) => {
    // Real builds POST to the tenants-publish Edge Function, which re-checks everything and queues a job.
    pub.save(withStatus(p, store, 'building'));
    setNotice(`Demo: no build server is connected, so nothing was sent to ${STORE_LABEL[store]}. In a real account this queues a build.`);
  };

  return (
    <div style={{ display: 'grid', gap: 28, maxWidth: 900 }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <h2>Publish {tenant.appName}</h2>
        <p className="muted" style={{ margin: 0 }}>
          Your app is published from your own Apple and Google developer accounts, so the listing, reviews and downloads belong to you, and stay yours if you
          ever leave Spotter.
        </p>
        <p className={s.banner} style={{ margin: 0 }}>
          Demo: there is no build server or sign-in here. Keys you add are checked in this browser and only their fingerprint is kept.
        </p>
      </div>

      {/* ---------- status ---------- */}
      <section className={s.section} aria-labelledby="status">
        <h3 id="status">Store status</h3>
        <div className={s.stores}>
          {(['ios', 'android'] as Store[]).map((store) => {
            const status = p.status[store];
            const rej = p.rejection[store];
            const guide = rej ? REJECTION_GUIDANCE[rej.code] : undefined;
            const ok = canSubmit(readiness, store);
            const reasons = [
              ...readiness.missingAssets.map((a) => `Missing: ${a}`),
              ...readiness.brand.map((b) => b.message),
              ...(readiness.missingCredentials.includes(store) ? [`Add your ${STORE_LABEL[store]} key below.`] : []),
              ...readiness.listing,
            ];
            return (
              <div key={store} className={s.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <strong>{STORE_LABEL[store]}</strong>
                  <span className={s.tag} style={{ color: STATUS_COLOR[status] }}>
                    {STORE_STATUS_LABEL[status]}
                  </span>
                </div>
                <span className={s.hint}>{STATUS_DETAIL[status]}</span>
                {rej ? (
                  <div className={s.alert} role="alert">
                    <span className="label">What {STORE_LABEL[store]} said</span>
                    <span>“{rej.message}”</span>
                    {guide ? (
                      <>
                        <strong style={{ marginTop: 6 }}>{guide.title}</strong>
                        <span>{guide.fix}</span>
                      </>
                    ) : null}
                  </div>
                ) : null}
                {status === 'draft' || status === 'rejected' ? (
                  <>
                    <button type="button" className="btn btn-primary" disabled={!ok} onClick={() => submit(store)}>
                      {status === 'rejected' ? 'Resubmit' : 'Submit'} to {STORE_LABEL[store]}
                    </button>
                    {!ok ? (
                      <ul className={s.hint} style={{ margin: 0, paddingLeft: 18 }} aria-label={`What’s needed before submitting to ${STORE_LABEL[store]}`}>
                        {reasons.slice(0, 5).map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : null}
                <label className="field">
                  <span className="label">Demo: show state</span>
                  <select value={status} onChange={(e) => pub.save(withStatus(p, store, e.target.value as StoreStatus, DEMO_REJECTION[store]))}>
                    {STORE_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {STORE_STATUS_LABEL[st]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            );
          })}
        </div>
        {notice ? (
          <p className={s.hint} role="status">
            {notice}
          </p>
        ) : null}
        {readiness.missingCredentials.length ? (
          <p className={s.hint}>
            Until your app is live, clients can use the shared Spotter app with your code
            {tenant.joinCode ? (
              <>
                {' '}
                <strong>{tenant.joinCode}</strong>
              </>
            ) : null}
            . It shows your branding.
          </p>
        ) : null}
      </section>

      {/* ---------- checklist ---------- */}
      <section className={s.section} aria-labelledby="checklist">
        <h3 id="checklist">
          Checklist · {steps.filter((x) => x.done).length} of {steps.length} done
        </h3>
        <ol className={s.steps}>
          {steps.map((st) => (
            <li key={st.key} className={s.step}>
              <span className={`${s.dot} ${st.done ? s.dotDone : ''}`} aria-label={st.done ? 'Done' : 'Not done'} role="img" />
              <div style={{ display: 'grid', gap: 2 }}>
                <strong>{st.title}</strong>
                <span className={s.hint}>{st.detail}</span>
                {st.key === 'apple_account' ? (
                  <a className={s.hint} href="https://developer.apple.com/programs/enroll/" target="_blank" rel="noreferrer">
                    Enrol in the Apple Developer Program
                  </a>
                ) : null}
                {st.key === 'google_account' ? (
                  <a className={s.hint} href="https://play.google.com/console/signup" target="_blank" rel="noreferrer">
                    Sign up for Google Play Console
                  </a>
                ) : null}
              </div>
              {st.key === 'apple_account' || st.key === 'google_account' ? (
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', minHeight: 44 }}>
                  <input
                    type="checkbox"
                    checked={st.done}
                    onChange={(e) => update(st.key === 'apple_account' ? { appleAccount: e.target.checked } : { googleAccount: e.target.checked })}
                  />
                  I’ve done this
                </label>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- keys ---------- */}
      <section className={s.section} aria-labelledby="keys">
        <h3 id="keys">Store keys</h3>
        <p className={s.hint} style={{ margin: 0 }}>
          These let Spotter build and submit your app from your accounts. They’re encrypted before they’re stored and can’t be viewed again, only replaced or deleted.
        </p>
        <div className={s.stores}>
          <IosKey p={p} update={update} />
          <AndroidKey p={p} update={update} />
        </div>
      </section>

      {/* ---------- listing ---------- */}
      <ListingKit tenantName={tenant.appName} p={p} description={description} update={update} privacy={privacyAnswers(tenant)} screenshots={screenshotPlan(tenant)} />

      {/* ---------- leaving ---------- */}
      <section className={s.section} aria-labelledby="leaving">
        <h3 id="leaving">Leaving Spotter</h3>
        <p className={s.hint} style={{ margin: 0 }}>
          Your store listings stay in your accounts. Revoking deletes the keys Spotter holds and cancels queued builds; it’s written to your audit log. Export
          your clients, programs and logs from the Data section first.
        </p>
        <div>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!p.credentials.ios && !p.credentials.android}
            onClick={() => {
              if (!globalThis.confirm('Revoke Spotter’s access? Spotter won’t be able to build or submit your app until you upload new keys.')) return;
              update({ credentials: { ios: false, android: false }, credentialInfo: { ios: null, android: null } });
              setNotice('Access revoked. Store keys deleted.');
            }}
          >
            Revoke Spotter’s access
          </button>
          {!p.credentials.ios && !p.credentials.android ? <p className={s.hint}>Spotter holds no keys for your accounts.</p> : null}
        </div>
      </section>
    </div>
  );
}

type Update = (patch: Partial<PublishData>) => void;

function KeyStatus({ info, onRemove }: { info: { fingerprint: string; label: string }; onRemove: () => void }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <span className={s.ok}>Key stored · {info.label}</span>
      <span className={s.hint}>Fingerprint {info.fingerprint}</span>
      <div>
        <button type="button" className="btn btn-secondary" onClick={onRemove}>
          Remove key
        </button>
      </div>
    </div>
  );
}

function IosKey({ p, update }: { p: PublishData; update: Update }) {
  const [keyId, setKeyId] = useState('');
  const [issuerId, setIssuerId] = useState('');
  const [file, setFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFile(f ? await f.text() : null);
  };
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = StoreCredentialUpload.safeParse({ platform: 'ios', keyId: keyId.trim(), issuerId: issuerId.trim(), privateKeyP8: file ?? '' });
    if (!parsed.success) {
      const path = parsed.error.issues[0]?.path[0];
      setError(path === 'keyId' ? 'The key ID is 10 letters and numbers, shown next to the key in App Store Connect.' : path === 'issuerId' ? 'The issuer ID is the long ID at the top of the Integrations page.' : 'Choose the .p8 file you downloaded when you made the key.');
      return;
    }
    setError(null);
    update({ credentials: { ...p.credentials, ios: true }, credentialInfo: { ...p.credentialInfo, ios: { fingerprint: await sha256Fingerprint(file!), label: `key ${keyId.trim()}` } } });
  };

  return (
    <div className={s.card}>
      <strong>App Store Connect API key</strong>
      {p.credentialInfo.ios ? (
        <KeyStatus info={p.credentialInfo.ios} onRemove={() => update({ credentials: { ...p.credentials, ios: false }, credentialInfo: { ...p.credentialInfo, ios: null } })} />
      ) : (
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10 }}>
          <ol className={s.hint} style={{ margin: 0, paddingLeft: 18 }}>
            <li>In App Store Connect, open Users and Access → Integrations → App Store Connect API.</li>
            <li>Generate a key with the App Manager role and download the .p8 file (you can only download it once).</li>
          </ol>
          <label className="field">
            <span className="label">Key ID</span>
            <input value={keyId} onChange={(e) => setKeyId(e.target.value.toUpperCase())} autoComplete="off" />
          </label>
          <label className="field">
            <span className="label">Issuer ID</span>
            <input value={issuerId} onChange={(e) => setIssuerId(e.target.value)} autoComplete="off" />
          </label>
          <label className="field">
            <span className="label">Key file (.p8)</span>
            <input type="file" accept=".p8" onChange={onFile} />
          </label>
          {error ? (
            <span className={s.error} role="alert">
              {error}
            </span>
          ) : null}
          <button type="submit" className="btn btn-primary">
            Add App Store key
          </button>
        </form>
      )}
    </div>
  );
}

function AndroidKey({ p, update }: { p: PublishData; update: Update }) {
  const [error, setError] = useState<string | null>(null);
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const text = await f.text();
    const parsed = StoreCredentialUpload.safeParse({ platform: 'android', serviceAccountJson: text });
    if (!parsed.success) {
      setError('That isn’t a Google service-account key. Download a JSON key for the service account in Google Cloud.');
      return;
    }
    setError(null);
    const email = (JSON.parse(text) as { client_email: string }).client_email;
    update({ credentials: { ...p.credentials, android: true }, credentialInfo: { ...p.credentialInfo, android: { fingerprint: await sha256Fingerprint(text), label: email } } });
  };
  return (
    <div className={s.card}>
      <strong>Google Play service account</strong>
      {p.credentialInfo.android ? (
        <KeyStatus info={p.credentialInfo.android} onRemove={() => update({ credentials: { ...p.credentials, android: false }, credentialInfo: { ...p.credentialInfo, android: null } })} />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <ol className={s.hint} style={{ margin: 0, paddingLeft: 18 }}>
            <li>In Google Cloud, create a service account and download a JSON key.</li>
            <li>In Play Console → Users and permissions, invite the service account’s email with release permissions.</li>
          </ol>
          <label className="btn btn-primary">
            Add service-account JSON
            <input type="file" accept="application/json,.json" onChange={onFile} style={{ display: 'none' }} />
          </label>
          {error ? (
            <span className={s.error} role="alert">
              {error}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ListingKit({
  tenantName,
  p,
  description,
  update,
  privacy,
  screenshots,
}: {
  tenantName: string;
  p: PublishData;
  description: string;
  update: Update;
  privacy: ReturnType<typeof privacyAnswers>;
  screenshots: ReturnType<typeof screenshotPlan>;
}) {
  const left = unfilledPlaceholders(description);
  return (
    <section className={s.section} aria-labelledby="listing">
      <h3 id="listing">Store listing</h3>
      <label className="field">
        <span className="label">Description</span>
        <textarea rows={12} value={description} onChange={(e) => update({ description: e.target.value, listingConfirmed: false })} />
      </label>
      {left.length ? (
        <span className={s.error} role="status">
          Replace {left.length === 1 ? 'this placeholder' : `these ${left.length} placeholders`} with your own words: {left.join(', ')}. We don’t write claims about your coaching for you.
        </span>
      ) : (
        <span className={s.hint}>No placeholders left.</span>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        <span className="label">Screenshots</span>
        <span className={s.hint}>Taken from {tenantName}’s real screens with your branding, one plain headline each. Only features you have switched on are shown.</span>
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Screen</th>
              <th scope="col">Headline</th>
            </tr>
          </thead>
          <tbody>
            {screenshots.map((sc, i) => (
              <tr key={sc.key}>
                <td>{i + 1}</td>
                <td>{sc.screen}</td>
                <td>{sc.headline}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <span className="label">App Store privacy label</span>
        <span className={s.hint}>Pre-filled from what the platform actually collects. Data is not used for tracking.</span>
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">Data type</th>
              <th scope="col">What</th>
              <th scope="col">Linked to the user</th>
              <th scope="col">Used for</th>
            </tr>
          </thead>
          <tbody>
            {privacy.apple.map((a) => (
              <tr key={a.category}>
                <td>{a.category}</td>
                <td>{a.items.join('; ')}</td>
                <td>{a.linkedToUser ? 'Yes' : 'No'}</td>
                <td>{a.purposes.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <span className="label">Google Play data safety</span>
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">What</th>
              <th scope="col">Shared</th>
              <th scope="col">Optional</th>
              <th scope="col">Purpose</th>
            </tr>
          </thead>
          <tbody>
            {privacy.google.map((g) => (
              <tr key={g.category}>
                <td>{g.category}</td>
                <td>{g.items.join('; ')}</td>
                <td>No</td>
                <td>{g.optional ? 'Yes' : 'No'}</td>
                <td>{g.purposes.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className={s.hint} style={{ margin: 0, paddingLeft: 18 }}>
          {privacy.statements.map((st) => (
            <li key={st}>{st}</li>
          ))}
        </ul>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" disabled={left.length > 0 || p.listingConfirmed} onClick={() => update({ listingConfirmed: true, description })}>
          {p.listingConfirmed ? 'Listing confirmed' : 'Confirm listing'}
        </button>
        {left.length ? <span className={s.hint}>Fill in the placeholders to confirm.</span> : null}
      </div>
    </section>
  );
}
