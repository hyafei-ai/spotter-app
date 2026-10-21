'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import {
  MODULE_LABEL,
  TAB_LABEL_OPTIONS,
  brandProblems,
  colorReport,
  iconProblems,
  logoProblems,
  type BrandDraft,
  type BrandField,
  type ModuleKey,
  type TabKey,
} from '@spotter/core';
import { ClientPreview } from '../../../src/publishing/ClientPreview';
import { inspectImage, thumbnail } from '../../../src/publishing/image';
import { TENANT, useAssets, usePublish, useSavedBrand } from '../../../src/publishing/storage';
import s from '../../../src/publishing/publishing.module.css';

const TAB_NAMES: Record<TabKey, string> = { today: 'First tab', history: 'Second tab', coach: 'Messages tab', me: 'Last tab' };

/** W-1 brand setup: everything the client app's look is built from, with a live preview. */
export default function BrandPage() {
  const saved = useSavedBrand();
  const assets = useAssets();
  const publish = usePublish();
  const [draft, setDraft] = useState<BrandDraft>(saved.value);
  const [dark, setDark] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [iconError, setIconError] = useState<string[]>([]);
  const [logoError, setLogoError] = useState<string[]>([]);

  // Start editing from the saved copy once it has been read from the browser.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved.loaded) setDraft(saved.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.loaded]);

  const problems = brandProblems(draft);
  const err = (f: BrandField) => problems.find((p) => p.field === f)?.message;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.value);
  const report = colorReport(draft.brandColor);
  const edit = (patch: Partial<BrandDraft>) => {
    setNotice(null);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const first = TENANT.coach.name.split(' ')[0] ?? 'Coach';

  const onSave = () => {
    if (problems.length) return;
    saved.save(draft);
    publish.save({ ...publish.value, brandSaved: true });
    setNotice('Saved. Clients see the new look next time they open the app; no store review needed.');
  };

  const onIcon = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { meta, dataUrl } = await inspectImage(file);
      const probs = iconProblems(meta);
      setIconError(probs);
      if (probs.length) return;
      const ok = assets.save({ ...assets.value, icon: await thumbnail(dataUrl) });
      if (ok) publish.save({ ...publish.value, iconUploaded: true });
      else setIconError(['The browser couldn’t store this preview. Try again in a normal (not private) window.']);
    } catch (err2) {
      setIconError([(err2 as Error).message]);
    }
  };

  const onLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { meta, dataUrl } = await inspectImage(file);
      const probs = logoProblems(meta);
      setLogoError(probs);
      if (probs.length) return;
      const ok = assets.save({ ...assets.value, logo: meta.type === 'image/svg+xml' ? dataUrl : await thumbnail(dataUrl) });
      if (ok) publish.save({ ...publish.value, logoUploaded: true });
      else setLogoError(['The browser couldn’t store this preview. Try a smaller SVG.']);
    } catch (err2) {
      setLogoError([(err2 as Error).message]);
    }
  };

  if (!saved.loaded) {
    return (
      <div aria-busy="true" style={{ display: 'grid', gap: 12 }}>
        <h2>Brand</h2>
        <p className="muted">Loading your brand…</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <h2>Brand</h2>
        <p className="muted" style={{ margin: 0, maxWidth: 640 }}>
          How {TENANT.appName}’s client app looks. One accent colour, your name and your words; everything else stays neutral so your colour looks deliberate.
        </p>
        <p className={s.banner} style={{ margin: 0 }}>
          Demo: this dashboard isn’t signed in yet, so changes are saved in this browser only.
        </p>
      </div>

      <div className={s.layout}>
        <form className={s.form} onSubmit={(e) => e.preventDefault()} aria-label="Brand settings">
          <section className={s.section}>
            <h3>Name</h3>
            <Field label={`App name · ${draft.appName.length}/30`} error={err('appName')}>
              <input value={draft.appName} maxLength={40} onChange={(e) => edit({ appName: e.target.value })} />
            </Field>
            <Field label={`Short name · ${draft.shortName.length}/12`} hint="Shown under the app icon on the home screen." error={err('shortName')}>
              <input value={draft.shortName} maxLength={20} onChange={(e) => edit({ shortName: e.target.value })} />
            </Field>
          </section>

          <section className={s.section}>
            <h3>Colour</h3>
            <div className={s.inline}>
              <Field label="Accent colour">
                <input value={draft.brandColor} maxLength={7} onChange={(e) => edit({ brandColor: e.target.value.trim().toUpperCase() })} aria-describedby="color-report" />
              </Field>
              <input
                type="color"
                aria-label="Pick the accent colour"
                value={report ? draft.brandColor.toLowerCase() : '#c2410c'}
                onChange={(e) => edit({ brandColor: e.target.value.toUpperCase() })}
                style={{ width: 48, height: 48, border: 0, background: 'none', padding: 0 }}
              />
              <span className={s.swatch} style={{ background: report?.dark ?? 'transparent' }} title="Dark mode shade" aria-hidden />
            </div>
            <div id="color-report" className={s.report} style={{ borderLeftColor: report ? (report.ok ? 'var(--success)' : 'var(--warning)') : 'var(--error)' }} aria-live="polite">
              {!report ? (
                <span className={s.error}>Use a 6-digit hex colour, like #C2410C.</span>
              ) : report.ok ? (
                <strong className={s.ok}>Readable: {report.ratio.toFixed(1)}:1 on the app background (needs 4.5:1).</strong>
              ) : (
                <>
                  <strong className={s.warn}>Too light for text: {report.ratio.toFixed(1)}:1 (needs 4.5:1).</strong>
                  <div>
                    <button type="button" className="btn btn-secondary" onClick={() => edit({ brandColor: report.suggestion })}>
                      Use {report.suggestion}, the nearest readable shade
                    </button>
                  </div>
                </>
              )}
              {report ? <span className={s.hint}>Dark mode uses {report.dark} automatically ({report.darkRatio.toFixed(1)}:1).</span> : null}
            </div>
            <Field label="Splash screen background" error={err('splashBackground')}>
              <input value={draft.splashBackground} maxLength={7} onChange={(e) => edit({ splashBackground: e.target.value.trim().toUpperCase() })} />
            </Field>
          </section>

          <section className={s.section}>
            <h3>Icon and logo</h3>
            <div className={s.upload}>
              {assets.value.icon ? <img src={assets.value.icon} alt="Current app icon" /> : <div className={s.placeholderImg}>No icon yet</div>}
              <div style={{ display: 'grid', gap: 6 }}>
                <label className="btn btn-secondary">
                  Upload app icon
                  <input type="file" accept="image/png" onChange={onIcon} style={{ display: 'none' }} />
                </label>
                <span className={s.hint}>PNG, exactly 1024 × 1024 px, no transparent areas.</span>
                {iconError.map((m) => (
                  <span key={m} className={s.error} role="alert">
                    {m}
                  </span>
                ))}
              </div>
            </div>
            <div className={s.upload}>
              {assets.value.logo ? <img src={assets.value.logo} alt="Current logo" /> : <div className={s.placeholderImg}>Monogram {TENANT.coach.monogram}</div>}
              <div style={{ display: 'grid', gap: 6 }}>
                <label className="btn btn-secondary">
                  Upload logo
                  <input type="file" accept="image/svg+xml,image/png" onChange={onLogo} style={{ display: 'none' }} />
                </label>
                <span className={s.hint}>SVG, or PNG at least 1024 px. Without one, your monogram is used.</span>
                {logoError.map((m) => (
                  <span key={m} className={s.error} role="alert">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className={s.section}>
            <h3>Words and units</h3>
            <Field label="Welcome message" hint="The first thing new clients read, in your voice." error={err('welcomeMessage')}>
              <textarea rows={4} value={draft.welcomeMessage} onChange={(e) => edit({ welcomeMessage: e.target.value })} />
            </Field>
            <Field label="Support email" error={err('supportEmail')}>
              <input type="email" value={draft.supportEmail} onChange={(e) => edit({ supportEmail: e.target.value })} />
            </Field>
            <Field label="Privacy policy link" error={err('privacyPolicyUrl')}>
              <input type="url" value={draft.privacyPolicyUrl} onChange={(e) => edit({ privacyPolicyUrl: e.target.value })} />
            </Field>
            <Choices label="Units" value={draft.units} options={[['kg', 'Kilograms'], ['lb', 'Pounds']]} onChange={(units) => edit({ units: units as 'kg' | 'lb' })} />
          </section>

          <section className={s.section}>
            <h3>Tabs</h3>
            <p className={s.hint} style={{ margin: 0 }}>
              Rename the tabs from a fixed list so the app stays easy to support.
            </p>
            {(Object.keys(TAB_LABEL_OPTIONS) as TabKey[]).map((k) => (
              <Choices
                key={k}
                label={TAB_NAMES[k]}
                value={draft.tabs[k]}
                options={TAB_LABEL_OPTIONS[k].map((o) => [o, o === '{coach}' ? `${first} (your name)` : o] as [string, string])}
                onChange={(v) => edit({ tabs: { ...draft.tabs, [k]: v } })}
              />
            ))}
          </section>

          <section className={s.section}>
            <h3>Features</h3>
            {(Object.keys(MODULE_LABEL) as ModuleKey[]).map((m) => (
              <label key={m} className={s.toggle}>
                <span>{MODULE_LABEL[m]}</span>
                <input type="checkbox" checked={draft.modules[m]} onChange={(e) => edit({ modules: { ...draft.modules, [m]: e.target.checked } })} />
              </label>
            ))}
            <span className={s.hint}>Switching a feature off hides it from clients. Nothing they’ve already logged is deleted.</span>
          </section>

          <div className={s.footer}>
            <button type="button" className="btn btn-primary" onClick={onSave} disabled={!dirty || problems.length > 0}>
              Save brand
            </button>
            {dirty ? (
              <button type="button" className="btn btn-secondary" onClick={() => setDraft(saved.value)}>
                Discard changes
              </button>
            ) : null}
            <span className={problems.length ? s.error : s.hint} role="status">
              {notice ?? (problems.length ? `${problems.length} thing${problems.length === 1 ? '' : 's'} to fix: ${problems[0]!.message}` : dirty ? 'Unsaved changes.' : 'No changes yet.')}
            </span>
          </div>
        </form>

        <aside className={s.sticky} aria-label="Preview">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="label">Preview</span>
            <Choices label="Preview mode" hideLabel value={dark ? 'dark' : 'light'} options={[['light', 'Light'], ['dark', 'Dark']]} onChange={(v) => setDark(v === 'dark')} />
          </div>
          <ClientPreview draft={draft} coachName={TENANT.coach.name} monogram={TENANT.coach.monogram} logo={assets.value.logo} dark={dark} />
          <span className={s.hint}>A sketch of the welcome, Today and logger screens. The app itself is native and uses exactly these colours and words.</span>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {error ? (
        <span className={s.error} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className={s.hint}>{hint}</span>
      ) : null}
    </label>
  );
}

function Choices({ label, value, options, onChange, hideLabel }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void; hideLabel?: boolean }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'grid', gap: 6 }}>
      {hideLabel ? null : <span className="label">{label}</span>}
      <div className={s.choices}>
        {options.map(([v, l]) => (
          <button key={v} type="button" className={s.choice} aria-pressed={v === value} onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
