// Flat config shared by every package. Expo apps use eslint-config-expo; the rest use typescript-eslint.
import expoConfig from 'eslint-config-expo/flat.js';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.expo/**', '**/next-env.d.ts', 'packages/db/supabase/functions/**'] },
  ...expoConfig,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'react/display-name': 'off',
      // Zod's "const X = z.object(); type X = z.infer<typeof X>" pattern is intentional.
      '@typescript-eslint/no-redeclare': 'off',
    },
  },
  { files: ['**/*.config.js', '**/*.cjs', 'scripts/**/*.js'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  // Expo config plugins run in Node as CommonJS.
  {
    files: ['apps/*/plugins/**/*.js'],
    languageOptions: { globals: { __dirname: 'readonly', require: 'readonly', module: 'writable' } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
];
