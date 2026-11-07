// Checker Playwright config. Run: npx playwright test -c tests/playwright.config.mjs
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.mjs/,
  workers: 1, // one Glint at a time: global shortcuts collide otherwise
  fullyParallel: false,
  timeout: 6 * 60_000,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: '../test-output/checker/playwright-results.json' }]],
  outputDir: '../test-output/checker/pw-artifacts',
});
