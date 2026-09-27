import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// `npm run test:rpc`: tests the real server rules (RLS, submit_run's checks)
// against a real Supabase project, configured in .env.local. Kept out of
// `npm test` because it needs the network, credentials and ~1 minute.
export default defineConfig({
  test: {
    include: ['supabase/tests/**/*.test.ts'],
    environment: 'node',
    env: loadEnv('', process.cwd(), ''),
    testTimeout: 120_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
