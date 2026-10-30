import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  { files: ['client/**/*.js'], languageOptions: { globals: { ...globals.browser } } },
  {
    files: ['server/**/*.js', 'shared/**/*.js', '*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  { files: ['client/vite.config.js'], languageOptions: { globals: { ...globals.node } } },
];
