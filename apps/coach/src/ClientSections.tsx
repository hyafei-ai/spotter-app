import { ProgramSection } from './ProgramSection';
import { CheckInsSection, FormChecksSection } from './media/sections';
import { AiSection } from './ai/AiSection';
import { NutritionSection } from './nutrition/NutritionSection';
import { CoachSection } from './platform/CoachSection';
import { ReadSection } from './ReadSection';
import { RememberSection } from './memory/RememberSection';
import { CycleSection } from './CycleSection';
import { FuelSection } from './fuel/FuelSection';
import { PainSection } from './pain/PainSection';
import { WatchSection } from './watch/WatchSection';
import { viewerSeesHealth } from '@spotter/core';
import { useViewerLens } from './atrisk/AtRiskList';

/**
 * Shared health detail (reads, pain, cycle, fuel) is for the client's own coach only
 * (docs/physiology.md rule 4). A solo coach always sees it; in a team, the head coach doesn't see it
 * for an assistant's client, and the check-in card shows the neutral line instead.
 */
function healthOnly(Section: React.ComponentType<{ clientId: string }>) {
  function HealthOnly({ clientId }: { clientId: string }) {
    const { viewerId, coachOf, solo } = useViewerLens();
    return viewerSeesHealth(viewerId, { coachId: coachOf[clientId] ?? null }, { solo }) ? <Section clientId={clientId} /> : null;
  }
  return HealthOnly;
}

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
  healthOnly(ReadSection),
  healthOnly(PainSection),
  healthOnly(WatchSection),
  RememberSection,
  healthOnly(CycleSection),
  healthOnly(FuelSection),
  // Between sessions / the check-in card renders near the top of client detail (app/client/[id]/index.tsx).
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
