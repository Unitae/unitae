import boundaries from 'eslint-plugin-boundaries'

export default [
  {
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'shared', pattern: 'app/shared/**' },
        { type: 'features', pattern: 'app/features/*/**', capture: ['feature'] },
        { type: 'workers', pattern: 'workers/**' },
        { type: 'routes', pattern: 'app/routes/**' },
      ],
      'boundaries/ignore': ['**/*.test.ts', '**/*.spec.ts'],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'allow',
          rules: [
            {
              from: ['features'],
              disallow: ['features'],
              allow: [
                // Allow importing from the same feature
                ['features', { feature: '${from.feature}' }],
              ],
              importKind: 'value',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['app/features/**/server/**'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'shared', pattern: 'app/shared/**' },
        { type: 'features', pattern: 'app/features/*/**', capture: ['feature'] },
        { type: 'workers', pattern: 'workers/**' },
        { type: 'routes', pattern: 'app/routes/**' },
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'allow',
          rules: [
            {
              from: ['features'],
              disallow: ['features'],
              allow: [['features', { feature: '${from.feature}' }]],
              importKind: 'value',
            },
          ],
        },
      ],
    },
  },
]
