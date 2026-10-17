import { getRandomValues } from 'expo-crypto';

// UUIDv7 ids are generated on device (packages/core/src/ids.ts).
const g = globalThis as unknown as { crypto?: { getRandomValues?: unknown } };
if (!g.crypto) g.crypto = {};
if (!g.crypto.getRandomValues) g.crypto.getRandomValues = getRandomValues;
