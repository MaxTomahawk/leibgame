const { test, expect } = require('@playwright/test');

test('toont fallback melding wanneer modellen niet laden', async ({ page }) => {
  // Ga naar de pagina van het spel
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Leib' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Leib Clouds/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Leib Jump!/ })).toBeVisible();

  const startButton = page.locator('#start-btn');
  await expect(startButton).toBeVisible();
});

test.describe('Character selection catalog rendering', () => {

  test('should render dynamic character choices under "Choose your character"', async ({ page }) => {
    // Load your page
    await page.goto('/'); // Replace with your dev URL

    // Wait for the character selection container to be visible
    const charContainer = page.locator('#character-selection');
    await expect(charContainer).toBeVisible();

    const previewElements = await page.$$('.char-preview');
    expect(previewElements.length).toBeGreaterThan(0);

    for (const el of previewElements) {
      const modelId = await page.evaluate((element) => {
        return element.dataset.model;
      }, el);

      expect(modelId).toMatch(/^player_/);
    }
  });

});

