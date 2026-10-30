// Test fixtures shared by every browser test.
//
// Normal run (npm run test:e2e): each test gets its own headless-friendly Chrome from the Playwright config.
//
// Verification run (VERIFY=1, started by `npm run verify`): the tests drive a Chrome that is already open
// (CDP on VERIFY_CDP, default http://localhost:9222) so a person can watch them like a manual tester:
//   - every browser action waits VERIFY_SLOWMO ms (default 600) before it runs,
//   - a red dot follows the mouse and a label at the bottom shows which test is running,
//   - pages stay on screen for a moment after each navigation and at the end of each test.
import { chromium, expect, test as base, type BrowserContext, type Page } from '@playwright/test';

export const verifying = process.env.VERIFY === '1';
export const slowMo = Number(process.env.VERIFY_SLOWMO ?? 600);
/** `npm run verify -- --no-images`: no screenshots are captured, so the result file stays small. */
export const noImages = process.env.VERIFY_NO_IMAGES === '1';
const cdpUrl = process.env.VERIFY_CDP ?? 'http://localhost:9222';
const baseURL = `http://localhost:${process.env.E2E_PORT ?? 3100}`;

/** Runs inside every page: the red mouse dot and the "now testing" label (in a closed shadow root, so tests cannot see them). */
function overlay(title: string) {
  const add = () => {
    if (document.getElementById('__verify_host')) return;
    const host = document.createElement('div');
    host.id = '__verify_host';
    host.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none';
    const root = host.attachShadow({ mode: 'closed' });
    const dot = document.createElement('div');
    dot.style.cssText =
      'position:fixed;left:-50px;top:-50px;width:22px;height:22px;margin:-11px 0 0 -11px;border:3px solid #d92d20;' +
      'border-radius:50%;background:rgba(217,45,32,.15);pointer-events:none;transition:left .3s,top .3s,background .1s';
    const label = document.createElement('div');
    label.textContent = 'Testing: ' + title;
    label.style.cssText =
      'position:fixed;left:12px;bottom:12px;max-width:80vw;padding:6px 12px;border-radius:6px;background:#101828;color:#fff;' +
      'font:600 13px system-ui,sans-serif;pointer-events:none;opacity:.9';
    root.append(dot, label);
    document.documentElement.append(host);
    document.addEventListener(
      'mousemove',
      (e) => {
        dot.style.left = e.clientX + 'px';
        dot.style.top = e.clientY + 'px';
      },
      true,
    );
    document.addEventListener('mousedown', () => (dot.style.background = 'rgba(217,45,32,.7)'), true);
    document.addEventListener('mouseup', () => (dot.style.background = 'rgba(217,45,32,.15)'), true);
  };
  if (document.documentElement) add();
  else document.addEventListener('DOMContentLoaded', add);
}

export const test = base.extend<{}, { sharedContext: BrowserContext }>({
  // In a verification run, connect to the open Chrome instead of launching one (and never close it).
  browser: [
    async ({ playwright }, use) => {
      if (verifying) {
        const browser = await chromium.connectOverCDP(cdpUrl, { slowMo });
        await use(browser);
      } else {
        const browser = await playwright.chromium.launch({ channel: 'chrome' });
        await use(browser);
        await browser.close();
      }
    },
    { scope: 'worker' },
  ],

  // One window for the whole run, so the viewer is not chasing a new window for every test.
  sharedContext: [
    async ({ browser }, use) => {
      const ctx = await browser.newContext({ baseURL, viewport: verifying ? null : { width: 1280, height: 720 } });
      await ctx.newPage(); // anchor tab: keeps the window open between tests
      await use(ctx);
      await ctx.close();
    },
    { scope: 'worker' },
  ],

  context: async ({ sharedContext }, use, testInfo) => {
    await sharedContext.clearCookies();
    const decorate = (p: Page) => void p.addInitScript(overlay, testInfo.title);
    if (verifying) sharedContext.on('page', decorate);
    await use(sharedContext);
    sharedContext.off('page', decorate);
  },

  page: async ({ context }, use, testInfo) => {
    const page = await context.newPage();
    if (verifying) {
      await page.bringToFront();
      const goto = page.goto.bind(page);
      page.goto = async (...args: Parameters<typeof goto>) => {
        const response = await goto(...args);
        await page.waitForTimeout(slowMo);
        return response;
      };
    }
    await use(page);
    if (!noImages && testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
      const path = testInfo.outputPath('failure.png');
      await page.screenshot({ path }).catch(() => undefined);
      await testInfo.attach('failure-screenshot', { path, contentType: 'image/png' }).catch(() => undefined);
    }
    if (verifying && !page.isClosed()) await page.waitForTimeout(slowMo * 2); // let the viewer see the end state
    // Leave no stray tabs for the next test (the "second tab" tests open extra pages).
    for (const p of context.pages().slice(1)) await p.close().catch(() => undefined);
  },
});

export { expect };
