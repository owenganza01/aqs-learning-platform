import { defineConfig, devices } from '@playwright/test'

// Live-mode tests: the real app (Supabase configured) against a MOCKED Supabase API. Every
// request to the fake project URL is answered by e2e-live/mock-supabase.ts. These tests check
// wiring, states and error handling; they are not evidence about the real database (D34, T11).
const PORT = 5181
export const MOCK_SUPABASE_URL = 'http://127.0.0.1:54399'

export default defineConfig({
  testDir: './e2e-live',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: MOCK_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key', VITE_DATA_MODE: 'live' },
  },
})
