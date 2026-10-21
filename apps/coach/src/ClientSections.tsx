import { CheckInsSection, FormChecksSection } from './media/sections';

/**
 * Feature sections on the coach's client detail (K-3): program, check-ins, form checks, nutrition,
 * AI summary, payments, team. Each feature adds its section component to SECTIONS.
 */
const SECTIONS: React.ComponentType<{ clientId: string }>[] = [
  // feature sections
  FormChecksSection,
  CheckInsSection,
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
