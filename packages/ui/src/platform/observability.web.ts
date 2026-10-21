/*
 * Web preview build: the Sentry React Native SDK and PostHog's RN client are native-first, so the
 * web preview skips them. (The Next.js dashboard would use @sentry/nextjs and posthog-js instead.)
 */
export function initObservability(_opts: { app: 'client' | 'coach'; tenantSlug: string; release: string }): void {}
export function track(_event: string, _props: Record<string, string | number | boolean> = {}): void {}
export function identify(_userId: string): void {}
