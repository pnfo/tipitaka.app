import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// npm run test:e2e builds the fixture dbs, both web builds and the server first
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const SERVER = 'http://127.0.0.1:8412'
export const APP = 'http://127.0.0.1:8413'

export default defineConfig({
  testDir: '.',
  outputDir: 'test-results',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
  use: { baseURL: SERVER, trace: 'retain-on-failure' },
  webServer: [
    {
      command: `${repo}/server/bin/tipitaka_app -root-path ${repo} -db-dir ${repo}/e2e/fixtures/db -no-open -listen 127.0.0.1:8412`,
      url: `${SERVER}/api/health`,
      reuseExistingServer: !process.env.CI,
    },
    { command: `node ${repo}/scripts/static-server.mjs ${repo}/web/dist-app 8413`, url: `${APP}/index.html`, reuseExistingServer: !process.env.CI },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /android/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: /android|ssr|api/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: /android|ssr|api/ },
    { name: 'pixel', use: { ...devices['Pixel 7'] }, testIgnore: /android|ssr|api|parallel/ },
    { name: 'iphone', use: { ...devices['iPhone 14'] }, testIgnore: /android|ssr|api|parallel/ },
    { name: 'android-sim', use: { ...devices['Pixel 7'] }, testMatch: /android/ },
  ],
})
