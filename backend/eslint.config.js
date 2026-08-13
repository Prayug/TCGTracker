const js = require('@eslint/js');
const globals = require('globals');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  }
);
