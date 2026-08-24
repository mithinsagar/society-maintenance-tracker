import prettier from 'eslint-config-prettier';
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * ESLint flat config.
 *
 * `eslint-config-next` v16 ships native flat configs, so they are imported
 * directly. Routing them through `FlatCompat` (the older pattern) makes the
 * plugin graph self-referential and ESLint fails while serialising it.
 */
const eslintConfig = [
  ...coreWebVitals,
  ...nextTypescript,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'drizzle/**', 'shot.mjs'],
  },
];

export default eslintConfig;
