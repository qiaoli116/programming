// Iteration 2 browser tests: profile (UC-10), scoring (UC-11), breakdown (UC-12), sorting (UC-13), failures (UC-14).
// The server uses the offline FakeProvider; job titles with [FAIL], [NONE], [SLOW] make it misbehave on purpose.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { ACCOUNTS, signIn } from './helpers';

test.beforeEach(async ({ request }) => {
  expect((await request.post('/__test/reseed')).ok()).toBe(true);
});

const PROFILE = '## Summary\nReact and TypeScript developer with testing, accessibility and teamwork experience.';
const DISCLAIMER = /sent to an external AI company \(Anthropic\)/;

/** An employer posts a job with a special title; the page is left signed out. */
async function postJob(page: Page, title: string, requirements = 'React experience\nTesting skills') {
  await signIn(page, ACCOUNTS.employer);
  await expect(page.getByRole('heading', { name: 'My job posts' })).toBeVisible();
  const res = await page.request.post('/api/v1/jobs', {
    data: { title, location: 'Melbourne VIC', workType: 'Full-time', salary: '', description: 'A test posting.', requirements },
  });
  expect(res.ok()).toBe(true);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/sign-in/);
}

async function seekerWithProfile(page: Page, body = PROFILE) {
  await signIn(page, ACCOUNTS.seeker);
  await expect(page.getByRole('link', { name: 'My profile' })).toBeVisible();
  expect((await page.request.put('/api/v1/me/profile', { data: { body } })).ok()).toBe(true);
}

async function search(page: Page, keyword: string) {
  await page.goto('/');
  await page.getByLabel('Keyword').fill(keyword);
  await page.getByRole('button', { name: 'Search' }).click();
}

test.describe('UC-10 My profile', () => {
  test('TC-10-1 seeker saves a profile and reads it back; Saved date shows', async ({ page }) => {
    await signIn(page, ACCOUNTS.seeker);
    await page.getByRole('link', { name: 'My profile' }).click();
    await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();
    await page.getByLabel('Profile (Markdown)').fill(PROFILE);
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Your profile has been saved.')).toBeVisible();
    await expect(page.getByText(/^Saved \d+ \w+ \d{4}$/)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Profile (Markdown)')).toHaveValue(PROFILE);
  });

  test('TC-10-5 employer and signed-out visitors have no profile page or link', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/sign-in/);
    await signIn(page, ACCOUNTS.employer);
    await expect(page.getByRole('link', { name: 'My profile' })).toHaveCount(0);
    await page.goto('/profile');
    await expect(page.getByText('This page is for job seeker accounts')).toBeVisible();
  });

  test('TC-10-6 the privacy disclaimer is visible without any click', async ({ page }) => {
    await signIn(page, ACCOUNTS.seeker);
    await page.goto('/profile');
    await expect(page.getByText(DISCLAIMER)).toBeVisible();
  });

  test('TC-10-7 / SEC-10 the preview shows headings, and typed script does nothing', async ({ page }) => {
    await signIn(page, ACCOUNTS.seeker);
    await page.goto('/profile');
    let dialog = false;
    page.on('dialog', () => (dialog = true));
    await page.getByLabel('Profile (Markdown)').fill('## Skills\n- **Strong:** React\n\n<script>alert(1)</script><img src=x onerror="alert(2)">');
    const preview = page.getByTestId('profile-preview');
    await expect(preview.getByRole('heading', { name: 'Skills' })).toBeVisible();
    await expect(preview.locator('li strong')).toHaveText('Strong:');
    await expect(preview.locator('script')).toHaveCount(0);
    await expect(preview.locator('[onerror]')).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(dialog).toBe(false);
  });
});

test.describe('UC-11 Score the results', () => {
  test('TC-11-1 / TC-11-2 scoring gives every card a match and keeps the same jobs in the same order', async ({ page }) => {
    await seekerWithProfile(page);
    await search(page, 'developer');
    await expect(page.getByText(DISCLAIMER)).toBeVisible();
    await expect(page.locator('.match')).toHaveCount(0); // opt-in: nothing scored yet
    const before = await page.locator('.job-card h3').allTextContents();
    await page.getByRole('button', { name: 'Score these results' }).click();
    await expect(page.locator('.match').first()).toContainText('/ 10');
    await expect(page.locator('.job-card .match')).toHaveCount(before.length);
    expect(await page.locator('.job-card h3').allTextContents()).toEqual(before);
  });

  test('TC-11-3 while scoring runs the button is disabled, progress shows, and the list stays visible', async ({ page }) => {
    await postJob(page, '[SLOW] Slowcoach Developer');
    await seekerWithProfile(page);
    await search(page, 'slowcoach');
    await page.getByRole('button', { name: 'Score these results' }).click();
    await expect(page.getByRole('button', { name: 'Scoring…' })).toBeDisabled();
    await expect(page.getByText('Scoring 1 job…')).toBeVisible();
    await expect(page.locator('.job-card')).toHaveCount(1);
    await expect(page.locator('.job-card .match')).toContainText('/ 10');
    await expect(page.getByRole('button', { name: 'Score again' })).toBeEnabled();
  });

  test('TC-11-7 a reload clears the scores', async ({ page }) => {
    await seekerWithProfile(page);
    await search(page, 'developer');
    await page.getByRole('button', { name: 'Score these results' }).click();
    await expect(page.locator('.job-card .match').first()).toBeVisible();
    await page.reload();
    await expect(page.locator('.job-card').first()).toBeVisible();
    await expect(page.locator('.match')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Score these results' })).toBeVisible();
  });

  test('TC-11-9 employers and signed-out visitors see no score button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.job-card').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Score these results' })).toHaveCount(0);
    await expect(page.getByText('to score your results against your profile.')).toBeVisible();
    await signIn(page, ACCOUNTS.employer);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Score these results' })).toHaveCount(0);
  });
});

test.describe('UC-12 Criteria breakdown', () => {
  test('TC-12-1 / TC-12-5 a scored job shows up to five criteria; an unscored one shows no breakdown', async ({ page }) => {
    await seekerWithProfile(page);
    await search(page, 'developer');
    await page.getByRole('button', { name: 'Score these results' }).click();
    await expect(page.locator('.job-card .match').first()).toBeVisible();
    await page.locator('.job-card').first().click();
    await expect(page.getByText('Match with your profile')).toBeVisible();
    const rows = page.locator('.criteria li');
    expect(await rows.count()).toBeGreaterThan(0);
    expect(await rows.count()).toBeLessThanOrEqual(5);
    await expect(rows.first().locator('.level')).toBeVisible();
    await expect(rows.first().locator('.reason')).not.toBeEmpty();
    await expect(page.getByText('Scored by AI from your profile. Advisory only.')).toBeVisible();
    // back to the full list (no reload, so scores are kept): a job that was not scored has no breakdown
    await page.getByRole('link', { name: '← Back to search results' }).click();
    await expect(page.locator('.job-card').nth(20)).toBeVisible();
    await page.locator('.job-card', { hasNot: page.locator('.match') }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Match with your profile')).toHaveCount(0);
  });

  test('TC-12-4 Unknown is shown as Unknown and the card says how many were checked', async ({ page }) => {
    await postJob(page, 'Mixed Developer', 'React experience\nQuantum welding certificate\nTeamwork');
    await seekerWithProfile(page);
    await search(page, 'mixed developer');
    await page.getByRole('button', { name: 'Score these results' }).click();
    await expect(page.getByText('2 of 3 criteria could be checked.')).toBeVisible();
    await page.locator('.job-card').first().click();
    await expect(page.locator('.level.unknown')).toHaveText('Unknown');
    await expect(page.locator('.level.meets')).toHaveCount(2);
  });
});

test.describe('UC-13 Sort by match', () => {
  test('TC-13-3 / TC-13-4 sorting puts the best first, unscored last, and turning it off restores the order', async ({ page }) => {
    await postJob(page, '[FAIL] Broken Developer');
    await seekerWithProfile(page);
    await search(page, 'developer');
    await expect(page.getByRole('button', { name: 'Sort by match' })).toHaveCount(0); // only after scoring
    const original = await page.locator('.job-card h3').allTextContents();
    expect(original[0]).toBe('[FAIL] Broken Developer'); // newest first
    await page.getByRole('button', { name: 'Score these results' }).click();
    await page.getByRole('button', { name: 'Sort by match' }).click();
    await expect(page.getByText('highest match first')).toBeVisible();
    const titles = await page.locator('.job-card h3').allTextContents();
    expect(titles.at(-1)).toBe('[FAIL] Broken Developer');
    const numbers = (await page.locator('.job-card .match').allTextContents()).map((t) => parseFloat(t));
    const scored = numbers.filter((n) => !Number.isNaN(n));
    expect(scored).toEqual([...scored].sort((a, b) => b - a));
    expect(titles.length).toBe(original.length);
    await page.getByRole('button', { name: 'Sort by newest' }).click();
    expect(await page.locator('.job-card h3').allTextContents()).toEqual(original);
  });
});

test.describe('UC-14 When scoring cannot work', () => {
  test('TC-14-1 an empty profile asks the seeker to write one, with a link', async ({ page }) => {
    await signIn(page, ACCOUNTS.seekerNoApps);
    await search(page, 'developer');
    await page.getByRole('button', { name: 'Score these results' }).click();
    await expect(page.getByText('Your profile is empty.')).toBeVisible();
    await page.getByRole('link', { name: 'Write your profile' }).click();
    await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();
  });

  test('TC-14-2 one failing job says Not scored; the others keep their scores', async ({ page }) => {
    await postJob(page, '[FAIL] Broken Developer');
    await seekerWithProfile(page);
    await search(page, 'developer');
    await page.getByRole('button', { name: 'Score these results' }).click();
    const failed = page.locator('.job-card', { hasText: '[FAIL] Broken Developer' });
    await expect(failed.locator('.match')).toHaveText('Not scored');
    await expect(failed).toContainText('Scoring failed for this job.');
    await expect(page.locator('.job-card .match', { hasText: '/ 10' }).first()).toBeVisible();
  });

  test('TC-14-3 every job failing shows a message and keeps the results', async ({ page }) => {
    await postJob(page, '[FAIL] Zebra Keeper');
    await seekerWithProfile(page);
    await search(page, 'zebra');
    await page.getByRole('button', { name: 'Score these results' }).click();
    await expect(page.getByText('Scoring is not available right now.')).toBeVisible();
    await expect(page.locator('.job-card')).toHaveCount(1);
    await expect(page.locator('.match')).toHaveCount(0);
  });

  test('TC-14-5 a posting with no clear criteria says so, and no score is invented', async ({ page }) => {
    await postJob(page, '[NONE] Vague Developer');
    await seekerWithProfile(page);
    await search(page, 'vague');
    await page.getByRole('button', { name: 'Score these results' }).click();
    await expect(page.locator('.job-card .match')).toHaveText('No criteria');
    await expect(page.getByText('No criteria found in this posting.')).toBeVisible();
    await page.locator('.job-card').click();
    await expect(page.getByText('No criteria found in this posting.')).toBeVisible();
  });
});
