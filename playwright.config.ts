import { defineConfig, devices } from '@playwright/test'

// The learner dashboard and drawer exist only in the development build (src/App.tsx), so the
// tests run against the Vite dev server rather than a production preview.
// A dedicated port keeps the tests away from a developer's own dev server on the usual 5173.
const TEST_PORT = 5180
const TEST_URL = `http://localhost:${TEST_PORT}`

export default defineConfig({
  testDir: './e2e',
  // One worker, in order: the dev server optimises dependencies on first start, which can
  // reload the page, and serial runs keep the viewport changes in each test isolated.
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: TEST_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Always start a fresh server for the suite. Reusing an existing server could test a stale
  // build or another project. --strictPort makes startup fail, rather than move, if the port is taken.
  webServer: {
    command: `npm run dev -- --port ${TEST_PORT} --strictPort`,
    url: TEST_URL,
    reuseExistingServer: false,
  },
})
