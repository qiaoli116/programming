import { expect, type Page } from '@playwright/test';

export const ACCOUNTS = {
  seeker: 'alex.chen@example.com', // many applications
  seekerNoApps: 'daniel.okafor@example.com', // applied to nothing
  employer: 'hiring@northwind.example', // Northwind Digital: Frontend Developer + 4 more
  otherEmployer: 'hiring@cornercoffee.example',
};
export const PASSWORD = 'demo1234';

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).last().click();
}

/** Opens a job's detail page by searching for its title. */
export async function openJob(page: Page, title: string) {
  await page.goto(`/?keyword=${encodeURIComponent(title)}`);
  await page.getByRole('link', { name: new RegExp(`^${title}`) }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

export const tableRows = (page: Page) => page.locator('table.data tbody tr');
