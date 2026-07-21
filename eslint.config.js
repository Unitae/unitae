import tsParser from '@typescript-eslint/parser'
import boundaries from 'eslint-plugin-boundaries'

// Cross-feature boundary enforcement.
// See docs/development/architecture-conventions.md §3 "Feature Boundary Rule".
//
// `dependency.kind: 'value'` scopes the rule to runtime imports; type-only
// imports are unblocked. Flat config silently skips files not matched by
// `files:`, and boundaries needs a TS-aware parser to read source.

const boundariesElements = [
  { type: 'shared', pattern: 'app/shared/**' },
  { type: 'features', pattern: 'app/features/*/**', capture: ['feature'] },
  { type: 'workers', pattern: 'workers/**' },
  { type: 'routes', pattern: 'app/routes/**' },
]

export default [
  {
    files: ['app/features/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', '**/*.integration.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { boundaries },
    settings: {
      'boundaries/elements': boundariesElements,
      // Migration is complete (v7 entity selectors below); skip legacy-pattern
      // detection on every lint pass.
      'boundaries/legacy-warnings': false,
      // Resolve `~/*` path aliases so boundaries can classify imports.
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
      },
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          policies: [
            {
              from: { element: { type: 'features' } },
              disallow: { to: { element: { type: 'features' } } },
              dependency: { kind: 'value' },
            },
            // Same-feature interior imports.
            {
              from: { element: { type: 'features' } },
              allow: {
                to: { element: { type: 'features', captured: { feature: '{{ from.element.captured.feature }}' } } },
              },
              dependency: { kind: 'value' },
            },
            // Any feature can import another feature's top-level barrels:
            // `index.ts` (client-safe) and `index.server.ts` (server-only).
            {
              from: { element: { type: 'features' } },
              allow: { to: { element: { type: 'features' }, file: { path: 'app/features/*/index.{ts,tsx}' } } },
              dependency: { kind: 'value' },
            },
            {
              from: { element: { type: 'features' } },
              allow: { to: { element: { type: 'features' }, file: { path: 'app/features/*/index.server.{ts,tsx}' } } },
              dependency: { kind: 'value' },
            },
            // Dashboard is the documented cross-feature aggregator.
            {
              from: { element: { type: 'features', captured: { feature: 'dashboard' } } },
              allow: { to: { element: { type: 'features' } } },
              dependency: { kind: 'value' },
            },
          ],
        },
      ],
    },
  },
]
