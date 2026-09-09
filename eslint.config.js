import js from '@eslint/js'
import prettier from 'eslint-config-prettier/flat'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
  },
  {
    files: ['*.config.{js,ts}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Everything the room worker bundles is pure TypeScript and never imports from the UI.
    // `src/collection` and `src/data` are on this list because the worker reaches them too; the
    // browser's storage wrapper lives in `src/browser` rather than `src/ui` so that holds.
    files: [
      'src/engine/**',
      'src/cpu/**',
      'src/sim/**',
      'src/server/**',
      'src/protocol/**',
      'src/collection/**',
      'src/data/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/ui', '**/ui/**', 'react', 'react-dom'],
              message: 'Code the room worker bundles must not depend on the UI.',
            },
          ],
        },
      ],
    },
  },
  prettier,
])
