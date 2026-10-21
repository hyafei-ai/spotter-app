/** Grow dashboard sections. Plain module so both the server page and the client dashboard can import it. */
export const TABS = ['page', 'plans', 'leads', 'referrals', 'storefront', 'payments'] as const;
export type Tab = (typeof TABS)[number];
