import tsParser from '@typescript-eslint/parser'
import boundaries from 'eslint-plugin-boundaries'

// Cross-feature boundary enforcement (eslint-plugin-boundaries v6).
//
// Features in `app/features/<name>/` may NOT import each other directly.
// They may only import from another feature through that feature's
// top-level `index.ts`. See docs/development/architecture-conventions.md
// §3 "Feature Boundary Rule".
//
// The `dashboard/` feature is the documented cross-feature aggregator
// and is allowed to deep-import; the exemption is encoded as an `allow`
// rule below (not in a code comment).
//
// `dependency.kind: 'value'` means type-only imports are tolerated even
// across features, so the rule only blocks runtime coupling.
//
// IMPORTANT: ESLint flat config requires `files` patterns to lint
// non-`.js` extensions; without them, every `.ts`/`.tsx` file is silently
// skipped. And the boundaries plugin needs a TypeScript-aware parser
// (`@typescript-eslint/parser`) to read the source.

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
      // Resolve TypeScript path aliases (e.g. `~/features/X` → `app/features/X`)
      // so the boundaries plugin can classify imports correctly.
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
          rules: [
            // Default for features → features value imports: forbid.
            {
              from: { type: 'features' },
              disallow: { to: { type: 'features' } },
              dependency: { kind: 'value' },
            },
            // Exception 1: same-feature interior imports are fine.
            {
              from: { type: 'features' },
              allow: { to: { type: 'features', captured: { feature: '{{from.captured.feature}}' } } },
              dependency: { kind: 'value' },
            },
            // Exception 2: any feature can import another feature's
            // public boundary — its top-level `index.ts`. The `path`
            // selector matches the resolved file path absolutely.
            {
              from: { type: 'features' },
              allow: { to: { type: 'features', path: 'app/features/*/index.{ts,tsx}' } },
              dependency: { kind: 'value' },
            },
            // Exception 3: dashboard is the documented cross-feature aggregator
            // (see docs/development/architecture-conventions.md §3).
            {
              from: { type: 'features', captured: { feature: 'dashboard' } },
              allow: { to: { type: 'features' } },
              dependency: { kind: 'value' },
            },
          ],
        },
      ],
    },
  },
]
