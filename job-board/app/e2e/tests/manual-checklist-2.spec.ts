// Iteration 2 manual checklist (test plan section 8), carried out by the browser.
// MC2-1 needs a person to compare screenshots with mockups (the report marks it "needs review").
// MC2-2 .. MC2-4 are checked automatically. MC2-5 and MC2-6 are live-AI checks, recorded as notes in the result.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, noImages, test } from './fixtures';
import { ACCOUNTS, signIn } from './helpers';
import type { BrowserContext, Page, TestInfo } from '@playwright/test';

const MOCKUPS = path.resolve(process.cwd(), '../../docs/iteration-2/static-design');

test.beforeEach(async ({ request }) => {
  expect((await request.post('/__test/reseed')).ok()).toBe(true);
});

async function attachImage(info: TestInfo, name: string, shoot: () => Promise<Buffer>) {
  if (noImages) return;
  const body = await shoot();
  const file = info.outputPath(`${name.replace(/[^\w.-]+/g, '_')}.png`);
  await (await import('node:fs/promises')).writeFile(file, body);
  await info.attach(name, { path: file, contentType: 'image/png' });
}

/** Visits S-09, S-01 (scored) and S-02 (scored) as the demo seeker. */
async function walkScreens(page: Page, visit: (id: string, name: string) => Promise<void>) {
  await signIn(page, ACCOUNTS.seeker);
  await expect(page.locator('.site-header .who')).toBeVisible();
  await page.request.put('/api/v1/me/profile', { data: { body: '## Summary\nReact and TypeScript developer with testing and teamwork experience.' } });

  await page.getByRole('link', { name: 'My profile' }).click();
  await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();
  await visit('S-09', 'My profile');

  await page.getByRole('link', { name: 'Find jobs' }).click();
  await page.getByLabel('Keyword').fill('developer');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('button', { name: 'Score these results' }).click();
  await expect(page.locator('.job-card .match').first()).toBeVisible();
  await visit('S-01', 'Search, scored');

  await page.locator('.job-card').first().click();
  await expect(page.getByText('Match with your profile')).toBeVisible();
  await visit('S-02', 'Job detail, scored');
}

const MOCKUP_FILES: Record<string, string> = {
  'S-09': 's09-profile.html',
  'S-01': 's01-search-scored.html',
  'S-02': 's02-job-detail-scored.html',
};

test('MC2-1 each new screen matches its mockup (layout, wording, disclaimer)', async ({ page, context }, info) => {
  info.annotations.push({ type: 'review', description: 'Compare the attached screenshots with the iteration 2 mockups by eye.' });
  await walkScreens(page, async (id, name) => {
    await attachImage(info, `${id} ${name} – app`, () => page.screenshot({ fullPage: true }));
    const mock = await (context as BrowserContext).newPage();
    await mock.goto(pathToFileURL(path.join(MOCKUPS, MOCKUP_FILES[id])).href);
    await mock.bringToFront();
    await attachImage(info, `${id} ${name} – mockup`, () => mock.screenshot({ fullPage: true }));
    await mock.close();
    await page.bringToFront();
  });
});

test('MC2-2 new screens are usable in a narrow, phone-width window (no sideways scrolling)', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const overflowing: string[] = [];
  await walkScreens(page, async (id, name) => {
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) overflowing.push(`${id} ${name}`);
    await attachImage(info, `${id} ${name} – phone width`, () => page.screenshot({ fullPage: true }));
  });
  expect(overflowing, 'screens that scroll sideways at 390 px wide').toEqual([]);
});

test('MC2-3 score levels are readable without colour (the level is also written as text)', async ({ page }) => {
  await walkScreens(page, async () => undefined);
  const levels = await page.locator('.criteria .level').allTextContents();
  expect(levels.length).toBeGreaterThan(0);
  for (const text of levels) expect(['Meets', 'Partly', 'Does not meet', 'Unknown']).toContain(text.trim());
  await expect(page.locator('.match').first()).toContainText('/ 10');
});

test('MC2-4 wording of the scoring messages is clear and polite', async ({ page }, info) => {
  const technical = /undefined|\[object|\bNaN\b|\bnull\b|Exception|SQLITE|TypeError|ECONN|[A-Z]{2,}_[A-Z_]{2,}|\b(HTTP|status)\s*[45]\d\d\b/;
  const seen: string[] = [];
  const record = async (state: string, text: string | RegExp) => {
    await expect(page.getByText(text).first()).toBeVisible();
    expect(await page.locator('body').innerText(), `${state}: technical wording shown`).not.toMatch(technical);
    seen.push(`${state}\n  • ${text}`);
  };

  await signIn(page, ACCOUNTS.seekerNoApps);
  await page.goto('/?keyword=developer');
  await page.getByRole('button', { name: 'Score these results' }).click();
  await record('Empty profile', 'Your profile is empty.');

  await page.request.put('/api/v1/me/profile', { data: { body: 'React developer' } });
  await page.request.post('/api/v1/auth/sign-out');
  await page.goto('/');
  await record('Signed out', 'to score your results against your profile.');

  await info.attach('messages-checked', { body: seen.join('\n\n'), contentType: 'text/plain' });
});
