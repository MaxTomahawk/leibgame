const { test, expect } = require('@playwright/test');

test('platform hub shows both games', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1', { hasText: 'Leib' })).toBeVisible();
  await expect(page.locator('text=Leib Clouds')).toBeVisible();
  await expect(page.locator('text=Leib Jump!')).toBeVisible();
});

test.describe('Leib Clouds', () => {
  test('start screen loads with dynamic characters', async ({ page }) => {
    await page.goto('/games/clouds/');
    await expect(page.locator('h1', { hasText: 'Leib Clouds' })).toBeVisible();
    await page.waitForTimeout(3000);
    const previews = await page.$$('.char-preview');
    expect(previews.length).toBeGreaterThan(0);
  });
});

test.describe('Leib Jump', () => {
  test('start screen loads', async ({ page }) => {
    await page.goto('/games/jump/');
    await expect(page.locator('h1', { hasText: 'Leib Jump!' })).toBeVisible();
    await expect(page.locator('#start-btn')).toBeVisible();
  });
});
