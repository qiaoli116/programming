// The manual checklist from the test plan (section 8), carried out by the browser instead of a person.
// MC-1 cannot be judged by a program: it collects the screenshots, and the report marks it "needs review".
// MC-2 .. MC-5 are checked automatically.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, noImages, test } from './fixtures';
import { ACCOUNTS, openJob, signIn, tableRows } from './helpers';
import type { BrowserContext, Locator, Page, TestInfo } from '@playwright/test';

const MOCKUPS = path.resolve(process.cwd(), '../../docs/iteration-1/static-design');

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

async function signedIn(page: Page, email: string) {
  await signIn(page, email);
  await expect(page.locator('.site-header .who')).toBeVisible();
}

/** Visits every screen S-01 .. S-08 once, signing in as the right person for each. */
async function walkScreens(page: Page, context: BrowserContext, visit: (id: string, name: string) => Promise<void>) {
  await page.goto('/');
  await expect(page.locator('.job-card').first()).toBeVisible();
  await visit('S-01', 'Search');

  await openJob(page, 'Frontend Developer');
  await visit('S-02', 'Job details');

  await page.goto('/sign-in');
  await visit('S-08', 'Sign in');

  await signedIn(page, ACCOUNTS.seekerNoApps);
  await openJob(page, 'Kitchen Hand');
  await page.getByRole('link', { name: 'Apply for this job' }).click();
  await expect(page.getByRole('heading', { name: 'Your application' })).toBeVisible();
  await visit('S-03', 'Apply');

  await context.clearCookies();
  await signedIn(page, ACCOUNTS.seeker);
  await page.goto('/my-applications');
  await expect(tableRows(page).first()).toBeVisible();
  await visit('S-04', 'My applications');

  await context.clearCookies();
  await signedIn(page, ACCOUNTS.employer);
  await expect(page.getByRole('heading', { name: 'My job posts' })).toBeVisible();
  await visit('S-05', 'My job posts');

  await page.getByRole('link', { name: '+ Post a job' }).first().click();
  await expect(page.getByLabel('Job title')).toBeVisible();
  await visit('S-06', 'Post a job');

  await page.goto('/employer/jobs');
  await page.getByRole('link', { name: '5 applications' }).click();
  await tableRows(page).first().getByRole('button', { name: 'View' }).click();
  await expect(page.getByRole('heading', { name: 'Cover letter' })).toBeVisible();
  await visit('S-07', 'Applications');
}

const MOCKUP_FILES: Record<string, string> = {
  'S-01': 's01-search.html',
  'S-02': 's02-job-detail.html',
  'S-03': 's03-apply.html',
  'S-04': 's04-my-applications.html',
  'S-05': 's05-employer-jobs.html',
  'S-06': 's06-job-form.html',
  'S-07': 's07-applications.html',
  'S-08': 's08-sign-in.html',
};

test('MC-1 each screen matches its mockup (layout, wording, empty states)', async ({ page, context }, info) => {
  info.annotations.push({ type: 'review', description: 'Compare the attached screenshots with the mockups by eye.' });
  await walkScreens(page, context, async (id, name) => {
    await attachImage(info, `${id} ${name} – app`, () => page.screenshot({ fullPage: true }));
    const mock = await context.newPage();
    await mock.goto(pathToFileURL(path.join(MOCKUPS, MOCKUP_FILES[id])).href);
    await mock.bringToFront();
    await attachImage(info, `${id} ${name} – mockup`, () => mock.screenshot({ fullPage: true }));
    await mock.close();
    await page.bringToFront();
  });
});

test('MC-2 screens are usable in a narrow, phone-width window (no sideways scrolling)', async ({ page, context }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const overflowing: string[] = [];
  await walkScreens(page, context, async (id, name) => {
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (wide) overflowing.push(`${id} ${name}`);
    await attachImage(info, `${id} ${name} – phone width`, () => page.screenshot({ fullPage: true }));
  });
  expect(overflowing, 'screens that scroll sideways at 390 px wide').toEqual([]);
});

/** Presses Tab until the target has focus (a keyboard user cannot click). */
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 40; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('The Tab key never reached the control');
}

test('MC-3 forms can be completed with the keyboard only', async ({ page, context }) => {
  // Sign in
  await page.goto('/sign-in');
  await page.locator('h1').first().click();
  await tabTo(page, page.getByLabel('Email', { exact: true }));
  await page.keyboard.insertText(ACCOUNTS.seekerNoApps);
  await tabTo(page, page.getByLabel('Password', { exact: true }));
  await page.keyboard.insertText('demo1234');
  await page.keyboard.press('Enter');
  await expect(page.locator('.site-header .who')).toHaveText('Daniel Okafor');

  // Apply
  await openJob(page, 'Kitchen Hand');
  await tabTo(page, page.getByRole('link', { name: 'Apply for this job' }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Your application' })).toBeVisible();
  await page.locator('h1').first().click();
  await tabTo(page, page.getByLabel('Cover letter'));
  await page.keyboard.insertText('I would love to work here. Typed without a mouse.');
  await tabTo(page, page.getByRole('button', { name: 'Send application' }));
  await page.keyboard.press('Enter');
  await expect(page.getByText('Your application has been sent.')).toBeVisible();

  // Post a job (employer)
  await context.clearCookies();
  await signedIn(page, ACCOUNTS.employer);
  await page.goto('/employer/jobs/new');
  await page.locator('h1').first().click();
  await tabTo(page, page.getByLabel('Job title'));
  await page.keyboard.insertText('Keyboard Tester');
  await tabTo(page, page.getByLabel('Location'));
  await page.keyboard.insertText('Hobart TAS');
  await tabTo(page, page.getByLabel('Work type'));
  await page.keyboard.press('ArrowDown');
  await tabTo(page, page.getByLabel('Description'));
  await page.keyboard.insertText('Check that every form works without a mouse.');
  await tabTo(page, page.getByLabel('Requirements'));
  await page.keyboard.insertText('Patience\nA keyboard');
  await tabTo(page, page.getByRole('button', { name: 'Publish job' }));
  await page.keyboard.press('Enter');
  await expect(page.getByText('Your job has been published.')).toBeVisible();
});

test('MC-4 error and confirmation messages are clear and polite', async ({ page, context }, info) => {
  const seen: string[] = [];
  // No codes, "undefined", stack traces or raw HTML may reach the person using the page.
  const technical = /undefined|\[object|\bNaN\b|\bnull\b|Exception|SQLITE|TypeError|Unexpected token|ECONN|[A-Z]{2,}_[A-Z_]{2,}|\b(HTTP|status)\s*[45]\d\d\b/;
  const record = async (state: string, expected: (string | RegExp)[]) => {
    for (const text of expected) await expect(page.getByText(text).first()).toBeVisible();
    const body = (await page.locator('body').innerText()).replace(/\s+\n/g, '\n');
    expect(body, `${state}: technical wording shown to the user`).not.toMatch(technical);
    seen.push(`${state}\n${expected.map((t) => `  • ${t}`).join('\n')}`);
  };

  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await record('Sign in, nothing typed', ['Enter your email address.', 'Enter your password.']);

  await signIn(page, ACCOUNTS.seeker, 'wrong-password');
  await record('Sign in, wrong password', ['Email or password is incorrect.']);

  await signedIn(page, ACCOUNTS.seekerNoApps);
  await openJob(page, 'Kitchen Hand');
  await page.getByRole('link', { name: 'Apply for this job' }).click();
  await page.getByRole('button', { name: 'Send application' }).click();
  await record('Apply without a cover letter', ['Please fix the highlighted fields.', 'Please write a short cover letter.']);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await record('After signing out', ['You have been signed out.']);
  await page.goto('/my-applications');
  await record('Protected page, signed out', ['Please sign in to continue.']);

  await page.goto('/jobs/99999');
  await record('Job that does not exist', ['Job not found']);

  await context.clearCookies();
  await signedIn(page, ACCOUNTS.employer);
  await page.goto('/employer/jobs/new');
  await page.getByLabel('Location').fill('Hobart TAS');
  await page.getByRole('button', { name: 'Publish job' }).click();
  await record('Post a job with fields missing', ['Please fix the highlighted fields. Nothing has been saved.', 'Job title is required.']);

  await info.attach('messages-checked', { body: seen.join('\n\n'), contentType: 'text/plain' });
});

test('MC-5 the demo accounts box on Sign in lists working accounts', async ({ page, context }, info) => {
  await page.goto('/sign-in');
  const listed = [...new Set((await page.locator('body').innerText()).match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [])];
  expect(listed.length, 'accounts listed in the demo box').toBeGreaterThanOrEqual(2);
  for (const email of listed) {
    await context.clearCookies();
    await signIn(page, email); // the box says every demo account uses demo1234
    await expect(page.locator('.site-header .who'), `signing in as ${email}`).toBeVisible();
  }
  await info.attach('accounts-tried', { body: listed.join('\n'), contentType: 'text/plain' });
});
