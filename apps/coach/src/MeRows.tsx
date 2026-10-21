import { AiMeRow } from './ai/AiMeRow';

/** Extra rows on the coach's Me tab: brand, publish, team, data. Each feature adds its row to ME_ROWS. */
const ME_ROWS: React.ComponentType[] = [
  // feature rows
  AiMeRow,
];

export function MeRows() {
  return (
    <>
      {ME_ROWS.map((Row, i) => (
        <Row key={i} />
      ))}
    </>
  );
}
