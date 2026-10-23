import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { View } from 'react-native';
import type { ModuleKey } from '@spotter/core';
import { SectionLabel } from '@spotter/ui';
import { CheckInDueRow, FormCheckReplyRow, FormCheckRequestRow } from './formchecks/DueRows';
import { NutritionDueRow } from './nutrition/DueRow';
import { FuelDueRow } from './fuel/FuelRows';
import { isOn } from './modules';

/**
 * Today's "Due" list (C-3): weekly check-in, form check requested, habit tasks, nutrition.
 * Each feature adds its row here with the module(s) that switch it on. A row renders null when
 * nothing is due and reports that with useDueVisible, so the heading only shows when something is due.
 */
const DUE_ROWS: { key: string; modules: ModuleKey[]; Row: React.ComponentType }[] = [
  { key: 'checkin', modules: ['checkIns'], Row: CheckInDueRow },
  { key: 'formcheck-request', modules: ['formChecks'], Row: FormCheckRequestRow },
  { key: 'formcheck-reply', modules: ['formChecks'], Row: FormCheckReplyRow },
  { key: 'nutrition', modules: ['nutrition', 'habits'], Row: NutritionDueRow },
  { key: 'fuel', modules: ['nutrition'], Row: FuelDueRow },
];

const DueContext = createContext<(key: string, visible: boolean) => void>(() => {});
const RowKey = createContext('');

/** Rows call this with whether they're showing anything. Call it before any early return. */
export function useDueVisible(visible: boolean) {
  const report = useContext(DueContext);
  const key = useContext(RowKey);
  useEffect(() => {
    report(key, visible);
  }, [report, key, visible]);
}

export function DueItems() {
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const report = useCallback(
    (key: string, v: boolean) => setVisible((s) => (s[key] === v ? s : { ...s, [key]: v })),
    [],
  );
  const rows = DUE_ROWS.filter((r) => r.modules.some(isOn));
  if (rows.length === 0) return null;
  const any = rows.some((r) => visible[r.key]);
  return (
    <DueContext.Provider value={report}>
      <View>
        {any ? <SectionLabel>Due</SectionLabel> : null}
        {rows.map(({ key, Row }) => (
          <RowKey.Provider key={key} value={key}>
            <Row />
          </RowKey.Provider>
        ))}
      </View>
    </DueContext.Provider>
  );
}
