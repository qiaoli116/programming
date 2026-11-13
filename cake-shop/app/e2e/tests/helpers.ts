import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const BAKER_PASSWORD = 'e2e-password';
export const brief = { occasion: 'kids', guests: 20, date: '', dietary: ['gluten-free'], fulfilment: 'pickup' };

export const isoPlus = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export async function reseed(request: APIRequestContext) {
  expect((await request.post('/__test/reseed')).ok()).toBeTruthy();
}

/** An order the customer has already confirmed (waiting for the baker), made through the API. */
export async function waitingOrder(request: APIRequestContext) {
  const created = await request.post('/api/orders', { data: { brief: { ...brief, date: isoPlus(8) }, template: 'unicorn-round' } });
  const { id, token } = await created.json();
  const done = await request.post(`/api/orders/${id}/confirm?t=${token}`, {
    data: { fulfilment: 'pickup', slot: '10-12', contact: { name: 'Jordan', phone: '0400 000 111', email: 'jordan@example.com' }, final: true },
  });
  expect(done.ok()).toBeTruthy();
  return { id: id as string, token: token as string };
}

export async function bakerLogin(page: Page) {
  await page.goto('/baker/login');
  await page.getByLabel('Password').fill(BAKER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Orders' })).toBeVisible();
}
