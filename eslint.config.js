import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'coverage',
      'backend',
      'packages',
      '.vite',
      '**/.vite/**',
      '*.config.*',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Keep a11y guidance without failing CI on legacy surfaces (redesign PR hardens these).
      ...Object.fromEntries(
        Object.entries(jsxA11y.configs.recommended.rules).map(([k, v]) => [
          k,
          typeof v === 'string' && v === 'error' ? 'warn' : Array.isArray(v) && v[0] === 'error' ? ['warn', ...v.slice(1)] : v,
        ])
      ),
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-alert': 'error',
      // Collector's Exchange guard rails (docs/design/collectors-exchange.md):
      // colours come from tokens, radii from the compressed scale, and no
      // letter-spaced uppercase eyebrows.
      'no-restricted-syntax': [
        'error',
        ...[
          ['Literal', 'value'],
          ['TemplateElement', 'value.raw'],
        ].flatMap(([node, key]) => [
          {
            selector: `${node}[${key}=/\\[#[0-9a-fA-F]{3,8}/]`,
            message:
              'Arbitrary hex colour in a class. Use a design token (bg-surface-*, text-ink-*, accent, gold, gain, loss, warn, stage).',
          },
          {
            selector: `${node}[${key}=/rounded(-[trblxyse]{1,2})?-(2xl|3xl)/]`,
            message: 'rounded-2xl/3xl are retired. Controls use rounded-md, sheets rounded-lg/xl.',
          },
          {
            selector: `${node}[${key}=/\\buppercase\\b[^'"\x60]*\\btracking-|\\btracking-[^'"\x60]*\\buppercase\\b/]`,
            message: 'No letter-spaced uppercase eyebrows. Use a sentence-case label (text-meta text-ink-muted).',
          },
        ]),
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // Vendored chart primitives — keep out of CI error budget
  {
    files: ['src/components/charts/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  }
);
