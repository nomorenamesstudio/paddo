import { defineConfig } from '@playwright/test'

const PORT = 4320
const PASSWORD = 'paddo-test-password'
const SECRET = 'test-secret-that-is-long-enough-for-the-config-loader'
const TOKEN = 'test-token-that-is-long-enough-for-the-config-loader'

process.env.E2E_PASSWORD = PASSWORD
process.env.E2E_TOKEN = TOKEN

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: 'node ./node_modules/tsx/dist/cli.mjs src/server/main.ts',
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 40_000,
    env: {
      ...(process.env as Record<string, string>),
      PADDO_PASSWORD: PASSWORD,
      PADDO_SECRET: SECRET,
      PADDO_TOKEN: TOKEN,
      PADDO_HOST: '127.0.0.1',
      PADDO_PORT: String(PORT),
      PADDO_CONTENT_DIR: 'tests/fixtures/content',
      PADDO_SIDECAR_DIR: '.paddo-test',
    },
  },
})
