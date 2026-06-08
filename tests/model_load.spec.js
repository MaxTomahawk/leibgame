const { test, expect } = require('@playwright/test');

test('hub lists available games', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Leibgame' })).toBeVisible();
  await expect(page.getByTestId('game-grid')).toBeVisible();
  await expect(page.getByTestId('game-tile-clouds')).toBeVisible();
  await expect(page.getByTestId('game-tile-jump-coming-soon')).toBeVisible();
});

test('start screen loads without model fallback warning', async ({ page }) => {
  await page.goto('/games/clouds/');

  const warning = page.locator('text=Model laden mislukt (gebruik fallback)');
  await expect(warning).not.toBeVisible();

  await expect(page.getByRole('heading', { name: 'Leib Weissman' })).toBeVisible();
  await expect(page.locator('#start-btn')).toBeVisible();
});

test.describe('Character selection 3D model rendering', () => {
  test('should render a 3D model under character selection', async ({ page }) => {
    await page.goto('/games/clouds/');

    const charContainer = page.locator('#character-selection');
    await expect(charContainer).toBeVisible();

    const previews = page.locator('.char-preview');
    await expect(previews).toHaveCount(3);

    for (let i = 0; i < 3; i++) {
      await expect(async () => {
        const hasModel = await previews.nth(i).evaluate((el) => !!el.previewModel);
        expect(hasModel).toBeTruthy();
      }).toPass({ timeout: 20000 });
    }
  });
});
