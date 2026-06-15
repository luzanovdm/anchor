import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

/** Flat ESLint config enforcing the Tetri-derived hard rules. */
export default [
  {
    // packages/ui-kit is vendored verbatim from @tetri/ui-kit — not authored here,
    // so it is exempt from Anchor's hard rules (it predates the no-BEM convention).
    ignores: [
      '**/dist/**',
      '**/release/**',
      '**/.angular/**',
      '**/node_modules/**',
      'packages/ui-kit/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.cts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2023, sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      // No `any` — use `unknown` + type guards.
      '@typescript-eslint/no-explicit-any': 'error',
      // No stray console in production code; use the Logger / error boundary.
      'no-console': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "TSNonNullExpression",
          message: 'Non-null assertion `!` is banned — narrow with a guard instead.',
        },
      ],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
];
