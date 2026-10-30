import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const backendModules = [
  '@scrb/storage',
  '@scrb/storage/*',
  '@scrb/transcription',
  '@scrb/transcription/*',
  '@scrb/summary',
  '@scrb/summary/*',
  '@scrb/export',
  '@scrb/export/*',
  'electron',
  'node:*',
];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dist-electron/**', '.claude/**', 'phase0/**', 'dev-plan/**'] },
  js.configs.recommended,
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', setTimeout: 'readonly' } },
  },
  ...tseslint.configs.recommended,
  {
    files: ['apps/desktop/src/ui/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // UI Specification: no UI code imports backend modules, only the contract.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: backendModules,
              message: 'UI code talks to the backend only via @scrb/contracts.',
            },
            {
              group: ['**/main/**', '**/preload/**'],
              message: 'UI code cannot reach into Electron processes.',
            },
          ],
        },
      ],
    },
  },
);
