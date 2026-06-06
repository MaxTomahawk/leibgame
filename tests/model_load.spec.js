const { test, expect } = require('@playwright/test');

test('start screen loads without model fallback warning', async ({ page }) => {
  await page.goto('/');

  const warning = page.locator('text=Model laden mislukt (gebruik fallback)');
  await expect(warning).not.toBeVisible();

  await expect(page.getByRole('heading', { name: 'Leib Weissman' })).toBeVisible();
  await expect(page.locator('#start-btn')).toBeVisible();
});

test.describe('Character selection 3D model rendering', () => {
  test('should render a 3D model under character selection', async ({ page }) => {
    await page.goto('/');

    const charContainer = page.locator('#character-selection');
    await expect(charContainer).toBeVisible();

    await page.waitForTimeout(3000);

    const previewElements = await page.$$('.char-preview');
    for (const el of previewElements) {
      const hasModel = await page.evaluate((element) => !!element.previewModel, el);
      expect(hasModel).toBeTruthy();
    }
  });
});
