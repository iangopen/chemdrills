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
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
