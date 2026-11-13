import { expect, test } from '@playwright/test';
import { reseed } from './helpers';

test.beforeEach(async ({ request }) => reseed(request));

async function startUnicorn(page: import('@playwright/test').Page) {
  await page.goto('/order/new');
  await page.getByLabel('Dietary').selectOption('gluten-free');
  await page.getByRole('button', { name: /Unicorn round, start with this/i }).click();
  await expect(page.getByRole('region', { name: 'Your cake' })).toBeVisible();
}

test('a customer goes from the start page to waiting for the baker', async ({ page }) => {
  await startUnicorn(page);
  await page.getByRole('button', { name: /Review & confirm/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Your name').fill('Jordan');
  await dialog.getByLabel('Phone').fill('0400 000 111');
  await dialog.getByLabel('Email').fill('jordan@example.com');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: /Confirm and pay/ }).click();
  await expect(page.getByRole('heading', { name: 'Your order is with the baker' })).toBeVisible();
});

test('the confirm button waits for the "final" box', async ({ page }) => {
  await startUnicorn(page);
  await page.getByRole('button', { name: /Review & confirm/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Your name').fill('Jordan');
  await dialog.getByLabel('Phone').fill('0400 000 111');
  await dialog.getByLabel('Email').fill('jordan@example.com');
  const confirm = dialog.getByRole('button', { name: /Confirm and pay/ });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole('checkbox').check();
  await expect(confirm).toBeEnabled();
});

test('a colour swatch changes the cake, adds a chat note and gets an acknowledgement', async ({ page }) => {
  await startUnicorn(page);
  const cake = page.locator('.stage div.cake');
  const before = await cake.innerHTML();
  await page.getByRole('button', { name: 'Purple' }).click();
  await expect.poll(() => cake.innerHTML()).not.toBe(before);
  await expect(page.locator('.evt')).toContainText('purple');
  await expect(page.locator('.m.ai').last()).toContainText('Got it:', { timeout: 6000 });
});

test('red velvet is disabled, with its reason, when gluten-free is on', async ({ page }) => {
  await startUnicorn(page);
  const velvet = page.getByRole('group', { name: 'Sponge' }).getByRole('button', { name: /red velvet/i });
  await expect(velvet).toBeDisabled();
  await expect(velvet).toHaveAttribute('title', /.+/);
});
