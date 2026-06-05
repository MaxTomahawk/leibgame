// @ts-check
import { test, expect } from '@playwright/test';

test('playwright::has title', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Leib Platform/);
});

test('playwright::shows game launcher', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: /Leib Clouds/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Leib Jump!/ })).toBeVisible();
});
