import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the app from https://<user>.github.io/<repo>/, so the base
// must be the repo name. See docs/SPEC.md section 1.9 / A6.
export default defineConfig({
  base: '/mandarin-bubble/',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});