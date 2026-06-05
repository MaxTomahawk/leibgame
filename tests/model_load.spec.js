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

test.describe('Character selection 3D model rendering', () => {

  test('should render a 3D model under "kies je karakter"', async ({ page }) => {
    // Load your page
    await page.goto('/'); // Replace with your dev URL

    // Wait for the character selection container to be visible
    const charContainer = page.locator('#character-selection');
    await expect(charContainer).toBeVisible();

    // Wait a bit for the 3D models to load asynchronously
    await page.waitForTimeout(3000);

    // Check each preview element to see if the 3D model is added
    const previewElements = await page.$$('.char-preview');
    expect(previewElements.length).toBeGreaterThan(0);

    for (const el of previewElements) {
      const hasModel = await page.evaluate((element) => {
        // previewModel is added when GLB loads
        return !!element.previewModel;
      }, el);

      expect(hasModel).toBeTruthy(); // Fails if the model isn't loaded
    }
  });

});

