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

  test('renders every POI returned by near-me, not only first six', async ({ page }) => {
    const pois = Array.from({ length: 8 }, (_, index) => ({
      id: String(index + 1),
      name: `POI ${index + 1}`,
      description: 'Test POI',
      latitude: 10.755 + index * 0.0001,
      longitude: 106.7035 + index * 0.0001,
      geofence_radius: 40,
      category: index === 0 ? 'food' : 'historical',
      qr_code_data: `BCSD-POI-${index + 1}`,
      status: 1,
      distance: index * 10,
    }));

    await page.route('http://localhost:8000/api/pois/near-me/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pois) });
    });
    await page.route('https://tiles.openfreemap.org/styles/bright', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#edeef0' } }] }),
      });
    });

    await page.goto('/map', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page.locator('.fmap002-map-marker')).toHaveCount(8, { timeout: 30_000 });
  });
});
