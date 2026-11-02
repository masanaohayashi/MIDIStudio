import { expect, test } from '@playwright/test';
import { importMidi, startAudio } from './helpers';
import { format1Song } from '../fixtures/songs';

// Run again with BASE_PATH=/MIDIStudio/ to cover the deployed GitHub Pages scope.
test('PWA: scoped install, offline reload, help and real audio playback', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Service Worker offline playback is checked on Chromium.');
  const base = process.env.BASE_PATH ?? '/';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base);
  const manifestUrl = await page.locator('link[rel="manifest"]').evaluate((el) => (el as HTMLLinkElement).href);
  const manifest = await (await page.request.get(manifestUrl)).json();
  expect(new URL(manifest.start_url, manifestUrl).pathname).toBe(base);
  expect(new URL(manifest.scope, manifestUrl).pathname).toBe(base);
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) {
    const response = await page.request.get(new URL(icon.src, manifestUrl).href);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
  }
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    }
  });
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(new URL(`${base}sw.js`, page.url()).href);
  await context.setOffline(true);
  await page.goto(`${base}?offline=1`);
  await expect(page.getByTestId('arrangement-canvas')).toBeVisible();
  // The audio chunks, worklet and SF2 have not been used by this page while online.
  await startAudio(page);
  await importMidi(page, format1Song());
  await page.getByTestId('transport-play').click();
  await expect(page.getByTestId('transport-position')).not.toHaveText('001.01.000');
  await page.getByTestId('transport-stop').click();
  await expect(page.getByTestId('error')).toHaveCount(0);
  for (const path of ['help.html', 'tutorial.html']) {
    const response = await page.goto(`${base}${path}`);
    expect(response?.fromServiceWorker()).toBe(true);
    await expect(page.locator('h1').first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});
