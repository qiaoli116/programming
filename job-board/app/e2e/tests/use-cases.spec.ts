// End-to-end tests: each use case in a real browser. Test names start with the id from the test plan
// (docs/iteration-1/test-plan/test-plan.html). Every test starts from freshly seeded data.
import { expect, test } from './fixtures';
import { ACCOUNTS, openJob, signIn, tableRows } from './helpers';

test.beforeEach(async ({ request }) => {
  const res = await request.post('/__test/reseed');
  expect(res.ok()).toBe(true);
});

test.describe('UC-01 Search for jobs', () => {
  test('TC-01-1 keyword matches title, description or company', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Keyword').fill('barista');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.locator('.job-card')).toHaveCount(1);
    await expect(page.locator('.job-card')).toContainText('Corner Coffee Co.');

    await page.getByLabel('Keyword').fill('quickship');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.locator('.job-card')).toHaveCount(6);
  });

  test('TC-01-2 location narrows the result; keyword and location combine', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Location').fill('Sydney');
    await page.getByRole('button', { name: 'Search' }).click();
    const count = await page.locator('.job-card').count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(30);
    await expect(page.locator('.job-card .meta').filter({ hasNotText: 'Sydney' })).toHaveCount(0);

    await page.getByLabel('Keyword').fill('analyst');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.locator('.job-card')).toHaveCount(1);
    await expect(page.locator('.job-card')).toContainText('Data Analyst');
  });

  test('TC-01-3 both fields empty lists all jobs, newest first', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('30 jobs found · newest first')).toBeVisible();
    await expect(page.locator('.job-card').first()).toContainText('Frontend Developer');
    await expect(page.locator('.job-card').first()).toContainText('Posted 2 days ago');
  });

  test('TC-01-4 nothing matches: a "no results" message is shown', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Keyword').fill('astronaut');
    await page.getByLabel('Location').fill('Hobart TAS');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('No jobs found for “astronaut” in Hobart TAS')).toBeVisible();
    await expect(page.locator('.job-card')).toHaveCount(0);
  });
});

test.describe('UC-02 View job details', () => {
  test('TC-02-1 job page shows every field', async ({ page }) => {
    await openJob(page, 'Frontend Developer');
    await expect(page.getByText('Northwind Digital').first()).toBeVisible();
    await expect(page.getByText('📍 Melbourne VIC')).toBeVisible();
    await expect(page.locator('.meta .chip')).toHaveText('Full-time');
    await expect(page.getByText('💰 $90k – $110k')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'About the role' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Requirements' })).toBeVisible();
    await expect(page.locator('.card ul li')).toHaveCount(4);
  });

  test('TC-02-2 a job with no salary displays correctly', async ({ page }) => {
    await openJob(page, 'Data Analyst');
    await expect(page.getByText('💰')).toHaveCount(0);
    await expect(page.getByText('Harbour Insurance').first()).toBeVisible();
  });

  test('TC-02-3 unknown job id shows a "job not found" page', async ({ page }) => {
    await page.goto('/jobs/99999');
    await expect(page.getByText('Job not found')).toBeVisible();
    await page.getByRole('link', { name: 'Search for jobs' }).click();
    await expect(page).toHaveURL('/');
  });

  // JB-002: the mockups keep "Find jobs" highlighted on the job page and the application form.
  test('"Find jobs" stays highlighted on the job page and the application form', async ({ page }) => {
    const findJobs = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Find jobs' });
    await signIn(page, ACCOUNTS.seekerNoApps);
    await openJob(page, 'Frontend Developer');
    await expect(findJobs).toHaveClass(/current/);
    await page.getByRole('link', { name: 'Apply for this job' }).click();
    await expect(page.getByRole('heading', { name: 'Your application' })).toBeVisible();
    await expect(findJobs).toHaveClass(/current/);
  });
});

test.describe('UC-03 Apply for a job', () => {
  test('TC-03-1 a signed-in seeker applies and sees the confirmation', async ({ page }) => {
    await signIn(page, ACCOUNTS.seekerNoApps);
    await openJob(page, 'Kitchen Hand');
    await page.getByRole('link', { name: 'Apply for this job' }).click();
    await expect(page.getByText('Applying as Daniel Okafor')).toBeVisible();
    await page.getByLabel('Phone').fill('0400 111 222');
    await page.getByLabel('Cover letter').fill('I am keen and reliable.');
    await page.getByRole('button', { name: 'Send application' }).click();
    await expect(page.getByText('Your application has been sent.')).toBeVisible();

    await page.getByRole('link', { name: 'View my applications' }).click();
    await expect(tableRows(page)).toHaveCount(1);
    await expect(tableRows(page).first()).toContainText('Kitchen Hand');
    await expect(tableRows(page).first()).toContainText('Corner Coffee Co.');
  });

  test('TC-03-2 signed out: Apply goes to Sign in, then returns to the application form', async ({ page }) => {
    await openJob(page, 'Kitchen Hand');
    await page.getByRole('link', { name: 'Sign in to apply' }).click();
    await expect(page).toHaveURL('/sign-in');
    await expect(page.getByText('Please sign in to apply for Kitchen Hand at Corner Coffee Co.')).toBeVisible();
    await page.getByLabel('Email', { exact: true }).fill(ACCOUNTS.seekerNoApps);
    await page.getByLabel('Password', { exact: true }).fill('demo1234');
    await page.getByRole('button', { name: 'Sign in' }).last().click();
    await expect(page).toHaveURL(/\/jobs\/\d+\/apply$/);
    await expect(page.getByRole('heading', { name: 'Your application' })).toBeVisible();
  });

  test('TC-03-3 cover letter missing: error shown, typed values kept, nothing saved', async ({ page }) => {
    await signIn(page, ACCOUNTS.seekerNoApps);
    await openJob(page, 'Kitchen Hand');
    await page.getByRole('link', { name: 'Apply for this job' }).click();
    await page.getByLabel('Phone').fill('0400 000 000');
    await page.getByRole('button', { name: 'Send application' }).click();
    await expect(page.getByText('Please fix the highlighted fields.')).toBeVisible();
    await expect(page.getByText('Please write a short cover letter.')).toBeVisible();
    await expect(page.getByLabel('Phone')).toHaveValue('0400 000 000');

    await page.goto('/my-applications');
    await expect(page.getByText('You have not applied for any jobs yet')).toBeVisible();
  });

  test('TC-03-4 applying a second time is refused with a clear message', async ({ page, context }) => {
    await signIn(page, ACCOUNTS.seekerNoApps);
    await openJob(page, 'Kitchen Hand');
    await page.getByRole('link', { name: 'Apply for this job' }).click();
    const applyUrl = page.url();

    // A second tab applies first, so the form in the first tab is now out of date.
    const other = await context.newPage();
    await other.goto(applyUrl);
    await other.getByLabel('Cover letter').fill('First!');
    await other.getByRole('button', { name: 'Send application' }).click();
    await expect(other.getByText('Your application has been sent.')).toBeVisible();

    await page.getByLabel('Cover letter').fill('Second try');
    await page.getByRole('button', { name: 'Send application' }).click();
    await expect(page.getByText('You have already applied for this job')).toBeVisible();

    await page.goto('/my-applications');
    await expect(tableRows(page)).toHaveCount(1);
  });

  test('a seeker who already applied sees that on the job page and the apply page', async ({ page }) => {
    await signIn(page, ACCOUNTS.seeker);
    await openJob(page, 'Frontend Developer');
    await expect(page.getByText(/You applied for this job on \d+ \w+ \d{4}/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Apply for this job' })).toHaveCount(0);
  });
});

test.describe('UC-04 View my applications', () => {
  test('TC-04-1 a seeker sees their own applications with job title and company', async ({ page }) => {
    await signIn(page, ACCOUNTS.seeker);
    await page.getByRole('link', { name: 'My applications' }).click();
    await expect(page.getByText('10 applications by Alex Chen')).toBeVisible();
    await expect(tableRows(page)).toHaveCount(10);
    await expect(tableRows(page).filter({ hasText: 'Frontend Developer' })).toContainText('Northwind Digital');
    await page.getByRole('link', { name: 'Frontend Developer' }).click();
    await expect(page).toHaveURL(/\/jobs\/\d+$/);
  });

  test('TC-04-2 a seeker with no applications sees the empty state', async ({ page }) => {
    await signIn(page, ACCOUNTS.seekerNoApps);
    await page.getByRole('link', { name: 'My applications' }).click();
    await expect(page.getByText('You have not applied for any jobs yet')).toBeVisible();
  });

  test('TC-04-3 signed out: redirected to Sign in', async ({ page }) => {
    await page.goto('/my-applications');
    await expect(page).toHaveURL('/sign-in');
    await expect(page.getByText('Please sign in to continue.')).toBeVisible();
  });
});

test.describe('UC-05 Post a job', () => {
  const fill = async (page: import('@playwright/test').Page) => {
    await page.getByLabel('Job title').fill('Test Engineer');
    await page.getByLabel('Location').fill('Hobart TAS');
    await page.getByLabel('Work type').selectOption('Contract');
    await page.getByLabel('Salary').fill('$700 / day');
    await page.getByLabel('Description').fill('Test the product.');
    await page.getByLabel('Requirements').fill('Careful\nCurious');
  };

  test('TC-05-1 an employer posts a job; it is found in search under their company', async ({ page }) => {
    await signIn(page, ACCOUNTS.employer);
    await expect(page.getByRole('heading', { name: 'My job posts' })).toBeVisible();
    await page.getByRole('link', { name: '+ Post a job' }).first().click();
    await expect(page.getByLabel('Company')).toHaveValue('Northwind Digital');
    await expect(page.getByLabel('Company')).toBeDisabled();
    await fill(page);
    await page.getByRole('button', { name: 'Publish job' }).click();
    await expect(page.getByText('Your job has been published.')).toBeVisible();
    await expect(tableRows(page)).toHaveCount(6);
    await expect(tableRows(page).filter({ hasText: 'Test Engineer' })).toContainText('0 applications');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.goto('/?keyword=Test%20Engineer');
    await expect(page.locator('.job-card')).toHaveCount(1);
    await expect(page.locator('.job-card')).toContainText('Northwind Digital');
  });

  test('TC-05-2 required fields missing: errors next to the fields, nothing saved', async ({ page }) => {
    await signIn(page, ACCOUNTS.employer);
    await page.goto('/employer/jobs/new');
    await page.getByLabel('Location').fill('Hobart TAS');
    await page.getByRole('button', { name: 'Publish job' }).click();
    await expect(page.getByText('Please fix the highlighted fields. Nothing has been saved.')).toBeVisible();
    await expect(page.getByText('Job title is required.')).toBeVisible();
    await expect(page.getByText('Please describe the role.')).toBeVisible();
    await expect(page.getByText('Please list the requirements.')).toBeVisible();
    await expect(page.getByLabel('Location')).toHaveValue('Hobart TAS');

    await page.goto('/employer/jobs');
    await expect(tableRows(page)).toHaveCount(5);
  });
});

test.describe('UC-06 Edit a job post', () => {
  test('TC-06-1 the owner edits a post; the change shows on the job page and in search', async ({ page }) => {
    await signIn(page, ACCOUNTS.employer);
    await tableRows(page).filter({ hasText: 'Frontend Developer' }).getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByRole('heading', { name: 'Edit job post' })).toBeVisible();
    await expect(page.getByLabel('Job title')).toHaveValue('Frontend Developer');
    await page.getByLabel('Job title').fill('Senior Frontend Developer');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Your changes have been saved.')).toBeVisible();

    await page.getByRole('link', { name: 'Senior Frontend Developer' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Senior Frontend Developer' })).toBeVisible();
    await page.goto('/?keyword=Senior');
    await expect(page.locator('.job-card')).toHaveCount(1);
  });

  test('TC-06-2 required field emptied: save is blocked with errors', async ({ page }) => {
    await signIn(page, ACCOUNTS.employer);
    await tableRows(page).filter({ hasText: 'Frontend Developer' }).getByRole('link', { name: 'Edit' }).click();
    await page.getByLabel('Job title').fill('');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Job title is required.')).toBeVisible();
    await expect(page).toHaveURL(/\/edit$/);
  });

  test("TC-06-3 another employer's post cannot be edited", async ({ page }) => {
    await signIn(page, ACCOUNTS.otherEmployer);
    await page.goto('/?keyword=Frontend%20Developer');
    const href = await page.locator('.job-card').first().getAttribute('href');
    await page.goto(`/employer/jobs/${href!.split('/').pop()}/edit`);
    await expect(page.getByText('You cannot edit this post')).toBeVisible();
  });
});

test.describe('UC-07 View applications for a job', () => {
  test('TC-07-1 the owner sees applicants and can read a cover letter', async ({ page }) => {
    await signIn(page, ACCOUNTS.employer);
    await page.getByRole('link', { name: '5 applications' }).click();
    await expect(page.getByRole('heading', { name: 'Applications' })).toBeVisible();
    await expect(tableRows(page)).toHaveCount(5);
    await expect(tableRows(page).first()).toContainText('@example.com');
    await tableRows(page).first().getByRole('button', { name: 'View' }).click();
    await expect(page.getByRole('heading', { name: 'Cover letter' })).toBeVisible();
  });

  test('TC-07-2 a post with no applications shows the empty state', async ({ page }) => {
    await signIn(page, ACCOUNTS.employer);
    await page.getByRole('link', { name: '0 applications' }).first().click();
    await expect(page.getByText('No applications yet')).toBeVisible();
  });

  test("TC-07-3 another employer's applications are refused", async ({ page }) => {
    await signIn(page, ACCOUNTS.employer);
    await page.getByRole('link', { name: '5 applications' }).click();
    const url = page.url();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await signIn(page, ACCOUNTS.otherEmployer);
    await page.goto(new URL(url).pathname);
    await expect(page.getByText('You cannot view these applications')).toBeVisible();
  });
});

test.describe('UC-08 Sign in', () => {
  test('TC-08-1 a seeker signs in and lands on the home page; the header shows their name', async ({ page }) => {
    await signIn(page, ACCOUNTS.seeker);
    await expect(page).toHaveURL('/');
    await expect(page.locator('.site-header .who')).toHaveText('Alex Chen');
    await expect(page.locator('.site-header .chip')).toHaveText('Seeker');
  });

  test('TC-08-2 an employer signs in and lands on "My job posts"', async ({ page }) => {
    await signIn(page, ACCOUNTS.employer);
    await expect(page).toHaveURL('/employer/jobs');
    await expect(page.getByRole('heading', { name: 'My job posts' })).toBeVisible();
    await expect(page.locator('.site-header .who')).toHaveText('Northwind Digital');
  });

  test('TC-08-3 wrong password and unknown email give the same generic message', async ({ page }) => {
    await signIn(page, ACCOUNTS.seeker, 'wrong-password');
    await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(ACCOUNTS.seeker);
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');

    await signIn(page, 'nobody@example.com');
    await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
  });

  test('TC-08-4 empty fields are highlighted and nothing is sent', async ({ page }) => {
    const sent: string[] = [];
    page.on('request', (r) => r.url().includes('/auth/sign-in') && sent.push(r.url()));
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Sign in' }).last().click();
    await expect(page.getByText('Enter your email address.')).toBeVisible();
    await expect(page.getByText('Enter your password.')).toBeVisible();
    expect(sent).toHaveLength(0);
  });

  test('the demo accounts box lists working accounts', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByText('demo1234').first()).toBeVisible();
    await expect(page.getByText('alex.chen@example.com')).toBeVisible();
    await expect(page.getByText('hiring@northwind.example')).toBeVisible();
  });
});

test.describe('UC-09 Sign out', () => {
  test('TC-09-1 sign out ends the session and shows the confirmation', async ({ page }) => {
    await signIn(page, ACCOUNTS.seeker);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('/sign-in');
    await expect(page.getByText('You have been signed out.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();
  });

  test('TC-09-2 after sign out, protected pages ask for sign-in again', async ({ page }) => {
    await signIn(page, ACCOUNTS.seeker);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.goto('/my-applications');
    await expect(page).toHaveURL('/sign-in');
    await expect(page.getByText('Please sign in to continue.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'My applications' })).toHaveCount(0);
  });
});
