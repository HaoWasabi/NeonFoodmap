import { test, expect } from '@playwright/test';

/**
 * Optional / flaky: PayPal sandbox + network + credentials.
 * Run with: npx playwright test --project=optional
 * CI: separate job with continue-on-error: true
 */
test.describe('payments (optional)', () => {
  test('tour detail page loads (prerequisite for checkout)', async ({ page }) => {
    await page.goto('/tours/1', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page).toHaveURL(/\/tours\/1/);
    await expect(page.locator('body')).toBeVisible();
  });
});
