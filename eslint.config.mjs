// ESLint 8.57 flat config (the version pinned in package-lock.json) for the API, the worker,
// the tests and the tooling scripts. The web app (web/) is a separate npm package linted by
// `next lint` with its own configuration (web/.eslintrc.json).
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

const typescriptRules = {
  ...tsPlugin.configs.recommended.rules,
  // Core rules superseded by the TypeScript compiler / @typescript-eslint equivalents.
  'no-unused-vars': 'off',
  'no-redeclare': 'off',
  'no-dupe-class-members': 'off',
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
  'no-console': 'error',
  eqeqeq: ['error', 'always'],
};

export default [
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'web/**',
      'infra/**',
      'prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
      globals: { ...globals.node, ...globals.jest },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...typescriptRules,
      // Nest injection relies on runtime class references in constructor signatures;
      // type-only imports would erase them from emitted decorator metadata.
      '@typescript-eslint/consistent-type-imports': 'off',
      'no-undef': 'off',
    },
  },
  {
    files: ['src/main.ts', 'src/worker.ts', 'src/database/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: { globals: { ...globals.node }, sourceType: 'module', ecmaVersion: 2022 },
  },
  {
    files: ['**/*.cjs', 'jest.config.js'],
    languageOptions: { sourceType: 'commonjs' },
  },
];
