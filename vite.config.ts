import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves the site at https://iangopenbusinessai-lab.github.io/chemdrills/.
  // Deliberately unconditional: every build (local, preview, e2e, CI) uses the
  // deployed base, so the tests run against exactly the bundle that ships. A
  // local-only '/' base would let a broken asset path pass every test and then
  // fail live. Hand-built paths must use import.meta.env.BASE_URL.
  base: '/chemdrills/',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
