const { test, expect } = require('@playwright/test');

async function countWorldMeshes (page) {
  return page.evaluate(() => {
    let count = 0;
    if (window.player?.parent) {
      window.player.parent.traverse((obj) => {
        if (obj.isMesh && obj.name !== 'SkySphere') count++;
      });
    }
    return count;
  });
}

async function startCloudsGame (page, name = 'TestPlayer') {
  await page.locator('.char-preview[data-model="leib.glb"]').click();
  await page.locator('#username-input').fill(name);
  await expect(page.locator('#start-btn')).toBeEnabled({ timeout: 20000 });
  await page.locator('#start-btn').click({ force: true });
  await expect(page.locator('#start-screen')).not.toHaveClass(/active/, { timeout: 30000 });
  await expect.poll(() => countWorldMeshes(page), { timeout: 10000 }).toBeGreaterThan(8);
  await expect.poll(() => page.evaluate(() => window.gameState), { timeout: 5000 }).toBe('playing');
}

test.describe('Clouds game start reliability', () => {
  test.describe.configure({ mode: 'serial', timeout: 60000 });

  test.beforeEach(async ({ page }) => {
    await page.goto('/games/clouds/');
    await expect(page.getByRole('heading', { name: 'Leib Weissman' })).toBeVisible();
  });

  test('starts after character selection on first visit', async ({ page }) => {
    await startCloudsGame(page);
    await expect(page.locator('#progress-bar')).toBeVisible();
  });

  test('starts again after page reload', async ({ page }) => {
    await startCloudsGame(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Leib Weissman' })).toBeVisible();
    await startCloudsGame(page, 'ReloadPlayer');
  });

  test('starts after hub round-trip via fresh navigation', async ({ page }) => {
    await startCloudsGame(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Leibgame' })).toBeVisible();
    await page.getByTestId('game-tile-clouds').click();
    await page.waitForURL('**/games/clouds/**');
    await expect(page.getByRole('heading', { name: 'Leib Weissman' })).toBeVisible();
    await startCloudsGame(page, 'RoundTrip');
  });

  test('starts after browser back from hub (bfcache recovery)', async ({ page }) => {
    await startCloudsGame(page);
    await page.goto('/');
    await page.goBack();
    await page.waitForURL('**/games/clouds/**');
    await expect(page.getByRole('heading', { name: 'Leib Weissman' })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#start-screen')).toHaveClass(/active/);
    await startCloudsGame(page, 'BackNav');
  });

  test('world rebuilds on second hub round-trip', async ({ page }) => {
    await startCloudsGame(page, 'Trip1');
    await page.goto('/');
    await page.getByTestId('game-tile-clouds').click();
    await page.waitForURL('**/games/clouds/**');
    await expect(page.getByRole('heading', { name: 'Leib Weissman' })).toBeVisible();
    await startCloudsGame(page, 'Trip2');
    await expect.poll(() => countWorldMeshes(page)).toBeGreaterThan(8);
  });

  test('starts after switching character before play', async ({ page }) => {
    await page.locator('.char-preview[data-model="katinka.glb"]').click();
    await page.locator('.char-preview[data-model="marco.glb"]').click();
    await page.locator('.char-preview[data-model="leib.glb"]').click();
    await startCloudsGame(page);
  });
});
