import { ProgramSection } from './ProgramSection';
import { CheckInsSection, FormChecksSection } from './media/sections';
import { AiSection } from './ai/AiSection';
import { NutritionSection } from './nutrition/NutritionSection';
import { CoachSection } from './platform/CoachSection';
import { ReadSection } from './ReadSection';
import { RememberSection } from './memory/RememberSection';
import { CycleSection } from './CycleSection';
import { FuelSection } from './fuel/FuelSection';
import { BetweenSessionsSection } from './atrisk/BetweenSessionsSection';
import { PainSection } from './pain/PainSection';

/**
 * Feature sections on the coach's client detail (K-3): program, check-ins, form checks, nutrition,
 * AI summary, payments, team. Each feature adds its section component to SECTIONS.
 */
const SECTIONS: React.ComponentType<{ clientId: string }>[] = [
  // feature sections
  ProgramSection,
  FormChecksSection,
  CheckInsSection,
  AiSection,
  NutritionSection,
  CoachSection,
  ReadSection,
  PainSection,
  RememberSection,
  CycleSection,
  FuelSection,
  BetweenSessionsSection,
];

export function ClientSections({ clientId }: { clientId: string }) {
  return (
    <>
      {SECTIONS.map((Section, i) => (
        <Section key={i} clientId={clientId} />
      ))}
    </>
  );
}
