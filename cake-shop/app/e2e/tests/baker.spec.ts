import { expect, test } from '@playwright/test';
import { bakerLogin, reseed, waitingOrder } from './helpers';

test.beforeEach(async ({ request }) => reseed(request));

test('the baker approves and the customer sees Confirmed', async ({ page, request }) => {
  const { id, token } = await waitingOrder(request);
  await bakerLogin(page);
  await page.locator(`[data-order="${id}"]`).click();
  await page.getByRole('button', { name: 'Approve order' }).click();
  await expect(page.getByRole('region', { name: `Order ${id}` }).getByText('✓ Confirmed')).toBeVisible();
  await page.goto(`/order/${id}?t=${token}`);
  await expect(page.getByRole('heading', { name: 'Your order is confirmed' })).toBeVisible();
});

test('a decline needs a reason, and the customer sees it', async ({ page, request }) => {
  const { id, token } = await waitingOrder(request);
  await bakerLogin(page);
  await page.locator(`[data-order="${id}"]`).click();
  await page.getByRole('button', { name: 'Decline…' }).click();
  const send = page.getByRole('button', { name: 'Send decline' });
  await expect(send).toBeDisabled();
  await page.getByLabel(/Reason for the customer/).fill('We are fully booked that day.');
  await send.click();
  await expect(page.getByText('Declined: We are fully booked that day.')).toBeVisible();
  await page.goto(`/order/${id}?t=${token}`);
  await expect(page.getByRole('alert')).toContainText('We are fully booked that day.');
});

test('the order detail has no edit control', async ({ page, request }) => {
  const { id } = await waitingOrder(request);
  await bakerLogin(page);
  await page.locator(`[data-order="${id}"]`).click();
  const detail = page.getByRole('region', { name: `Order ${id}` });
  await expect(detail.getByRole('button', { name: 'Approve order' })).toBeVisible();
  await expect(detail.getByRole('button', { name: /edit|change/i })).toHaveCount(0);
  await expect(detail.locator('input:not([type=checkbox]), select')).toHaveCount(0);
});
