import { test, expect } from '@playwright/test';

/**
 * Critical: tours list route is reachable.
 */
test.describe('tours', () => {
  test('loads /tours', async ({ page }) => {
    await page.goto('/tours', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page).toHaveURL(/\/tours/);
    await expect(page.locator('body')).toBeVisible();
  });
});
