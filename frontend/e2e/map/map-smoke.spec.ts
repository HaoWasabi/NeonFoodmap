import { test, expect } from '@playwright/test';

/**
 * Critical: map route loads (splash / map shell).
 */
test.describe('map', () => {
  test('loads /map without crash', async ({ page }) => {
    await page.goto('/map', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page).toHaveURL(/\/map/);
    // App shell should render something interactive or loading state
    await expect(page.locator('body')).toBeVisible();
  });
});
