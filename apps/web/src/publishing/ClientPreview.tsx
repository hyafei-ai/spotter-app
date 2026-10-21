'use client';

import type { CSSProperties } from 'react';
import { TAB_LABEL_OPTIONS, colorReport, onColor, type BrandDraft, type TabKey } from '@spotter/core';
import s from './publishing.module.css';

const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * An HTML/CSS mock of three client-app screens (welcome, Today, logger) in this brand.
 * It is a preview, not the app: the real screens are React Native, built from the same tokens.
 */
export function ClientPreview({ draft, coachName, monogram, logo, dark }: { draft: BrandDraft; coachName: string; monogram: string; logo: string | null; dark: boolean }) {
  const report = colorReport(draft.brandColor);
  const accent = !report ? '#5D5A52' : dark ? report.dark : report.suggestion;
  const vars = { '--pb': accent, '--pbi': HEX.test(accent) ? onColor(accent) : '#FFFFFF' } as CSSProperties;
  const first = coachName.split(' ')[0] ?? 'Coach';
  const tabs = (Object.keys(TAB_LABEL_OPTIONS) as TabKey[]).map((k) => (draft.tabs[k] === '{coach}' ? first : draft.tabs[k]));
  const unit = draft.units;
  const load = unit === 'kg' ? '82.5' : '180';
  const phone = `${s.phone} ${dark ? s.phoneDark : ''}`;

  return (
    <div className={s.phones} style={vars} aria-label={`Preview of ${draft.appName || 'your app'} in ${dark ? 'dark' : 'light'} mode`} role="img">
      <div className={phone}>
        <div className={s.pMono}>{logo ? <img src={logo} alt="" /> : monogram}</div>
        <div className={s.pLabel}>Coached by</div>
        <div className={s.pTitle}>{coachName}</div>
        <div className={s.pNote}>{draft.welcomeMessage || 'Your welcome message'}</div>
        <div className={s.pBtn}>Get started</div>
        <div style={{ height: 10 }} />
      </div>
      <div className={phone}>
        <div className={s.pTitle}>Lower A</div>
        <div className={s.pMuted}>Saturday, 17 October</div>
        <div className={s.pNote}>
          <div className={s.pLabel}>From {first}</div>
          Squats felt fast last week.
        </div>
        <div className={s.pLabel} style={{ marginTop: 4 }}>5 exercises</div>
        {['Back Squat', 'Romanian Deadlift', 'Split Squat'].map((e) => (
          <div key={e} className={s.pRow}>
            <span>{e}</span>
          </div>
        ))}
        <div className={s.pBtn}>Start Lower A</div>
        <div className={s.pTabs}>
          {tabs.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
      </div>
      <div className={phone}>
        <div className={s.pTitle}>Back Squat</div>
        <div className={s.pLabel}>Set · target · {unit} × reps</div>
        <div className={s.pRow}>
          <span>1 · {load} × 5–8</span>
          <span className={s.pStrike}>{load} × 8</span>
        </div>
        <div className={`${s.pRow} ${s.pRowActive}`}>
          <span>2 · {load} × 5–8</span>
        </div>
        <div className={s.pRow}>
          <span>3 · {load} × 5–8</span>
        </div>
        <div className={s.pBtn}>
          Log set 2 · {load} {unit} × 8
        </div>
        <div style={{ height: 10 }} />
      </div>
    </div>
  );
}
