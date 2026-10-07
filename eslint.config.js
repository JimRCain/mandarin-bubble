import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'music/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.{js,ts}', 'tests/e2e/**/*.ts'],
    languageOptions: {
      globals: {
        // Node built-ins the content scripts and configs use. Declared here
        // rather than pulling in the globals package for six names.
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
        Buffer: 'readonly',
        globalThis: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },
);