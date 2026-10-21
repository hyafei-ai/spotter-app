/** Web: Supabase keeps the session in localStorage (same as supabase-js's default). */
const ls = (): Storage | null => (typeof localStorage === 'undefined' ? null : localStorage);

export const secureStorage = {
  getItem: async (key: string) => ls()?.getItem(key) ?? null,
  setItem: async (key: string, value: string) => {
    ls()?.setItem(key, value);
  },
  removeItem: async (key: string) => {
    ls()?.removeItem(key);
  },
};
