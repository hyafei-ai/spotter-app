import * as Sentry from '@sentry/react-native';
import PostHog from 'posthog-react-native';

/**
 * Crash reporting (Sentry) and product analytics (PostHog), each only when its key is configured.
 * Every event carries the tenant so dashboards and crash triage can be split per trainer.
 * Never sends health data, photos or message content.
 */
let posthog: PostHog | null = null;

export function initObservability(opts: { app: 'client' | 'coach'; tenantSlug: string; release: string }): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (dsn) {
    Sentry.init({ dsn, release: `${opts.app}@${opts.release}`, environment: process.env.EXPO_PUBLIC_ENV ?? 'development', sendDefaultPii: false });
    Sentry.setTags({ app: opts.app, tenant: opts.tenantSlug });
  }
  const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (key) {
    posthog = new PostHog(key, { host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com' });
    posthog.register({ app: opts.app, tenant: opts.tenantSlug });
  }
}

export function track(event: string, props: Record<string, string | number | boolean> = {}): void {
  posthog?.capture(event, props);
}

export function identify(userId: string): void {
  posthog?.identify(userId);
  Sentry.setUser({ id: userId });
}
