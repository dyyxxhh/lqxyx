import { defineConfig, devices } from '@playwright/test';

const isProduction = !!process.env.E2E_PRODUCTION_URL;

const devWebServer = {
  command: 'npm run dev -- --host 127.0.0.1 --port 4173',
  url: 'http://127.0.0.1:4173',
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
} as const;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: isProduction ? 'http://127.0.0.1:8949' : 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  ...(isProduction ? {} : { webServer: devWebServer }),
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'mobile-landscape-chromium',
      use: {
        ...devices['Pixel 5 landscape'],
        viewport: { width: 915, height: 412 },
        isMobile: true,
        hasTouch: true,
      }
    },
    ...(isProduction ? [{
      name: 'production-chromium',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.E2E_PRODUCTION_URL
      }
    }] : [])
  ]
});
