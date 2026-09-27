import { defineConfig, devices } from '@playwright/test';

// Dedicated port, never reused: another local app may own Vite's default 4173.
const PORT = 4317;
// Must match `base` in vite.config.ts. Specs navigate with RELATIVE paths
// (page.goto('./')): goto('/') resolves against the host root and drops
// /chemdrills/, loading a 404 instead of the app.
const BASE_URL = `http://localhost:${PORT}/chemdrills/`;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  // Capped on purpose. The default (half the logical CPUs: 10 on the dev
  // machine) starves the one `vite preview` server and the renderers: page
  // loads never get a response, and Playwright's "stable" check never sees two
  // animation frames (the Family Sort bucket-click timeouts). Measured
  // 2026-09-26, sort specs x15: 13/150 and 9/150 (baseline commit) failed at
  // the default, 0/150 at 4. Don't raise timeouts instead.
  workers: 4,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    ...devices['Desktop Chrome'],
  },
  webServer: {
    // --mode e2e loads .env.e2e: a fake Supabase URL the specs mock (never a real project).
    command: `npm run build -- --mode e2e && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
