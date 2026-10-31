import { expect, test } from '@playwright/test';

test('completes a repair preview, confirms it, then undoes it from the archive', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('maplewick.intro.v1', 'seen');
    localStorage.setItem('maplewick.motion.v1', 'reduced');
    localStorage.setItem('maplewick.office.v1', 'flat');
  });
  await page.goto('/');

  await page.getByRole('button', { name: 'Open Maplewick Market' }).click();
  await expect(page.getByRole('heading', { name: 'A place for every piece.' })).toBeVisible();
  await page.getByRole('button', { name: 'Begin investigation' }).click();
  await expect(page.getByRole('heading', { name: 'Follow the loose threads.' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Follow the loose threads.' })).toBeVisible();

  await page.getByRole('button', { name: 'Preview repair' }).click();
  const preview = page.getByRole('dialog', { name: 'Review this change.' });
  await expect(
    preview.getByText('This is a preview. Your records have not changed.'),
  ).toBeVisible();
  await expect(preview.getByRole('region', { name: 'Proposed changes' })).toBeVisible();
  await preview.getByRole('button', { name: 'Confirm change' }).click();
  await expect(preview).toBeHidden();

  await page.getByRole('button', { name: /^Archive\b/ }).click();
  await expect(page.getByRole('heading', { name: 'A record of good work.' })).toBeVisible();
  const undo = page.getByRole('button', { name: 'Undo latest action' });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(undo).toBeDisabled();
  await expect(page.getByRole('status').first()).toContainText('The last action has been undone.');
  const downloadButton = page.getByRole('button', { name: 'Download Excel workbook' });
  await expect(downloadButton).toBeEnabled();
  const downloadPromise = page.waitForEvent('download', { timeout: 5_000 }).catch(() => undefined);
  const responsePromise = page.waitForResponse((response) => response.url().includes('/export?'));
  await downloadButton.click();
  const response = await responsePromise;
  const responseDetail = response.ok() ? '' : await response.text();
  expect(response.status(), responseDetail).toBe(200);
  const download = await downloadPromise;
  expect(download?.suggestedFilename()).toMatch(/\.xlsx$/);
});

test('runs bounded Open and Discovery queries and saves an evidence-backed finding', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('maplewick.intro.v1', 'seen');
    localStorage.setItem('maplewick.motion.v1', 'reduced');
    localStorage.setItem('maplewick.office.v1', 'flat');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open community club' }).click();
  await page.getByRole('button', { name: 'Begin investigation' }).click();
  await expect(page.getByRole('heading', { name: 'Follow the loose threads.' })).toBeVisible();

  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByLabel('Your question').fill('Which names are repeated?');
  await page.getByRole('button', { name: 'Ask the records' }).click();
  await expect(page.getByText('What the records tell us')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save finding' })).toBeVisible();
  await page.getByRole('button', { name: 'Save finding' }).click();
  await expect(page.getByRole('button', { name: 'Finding saved' })).toBeVisible();

  await page.getByRole('button', { name: 'Discovery', exact: true }).click();
  await page.getByLabel('Investigation operation').selectOption('group_count');
  await page.getByRole('button', { name: 'Investigate' }).click();
  await expect(page.getByText(/groups across/)).toBeVisible();
  await page.getByRole('button', { name: /^Archive\b/ }).click();
  await expect(page.getByText('Pinned findings')).toBeVisible();
});

test('keeps the case controls usable when WebGL is unavailable and reduced motion is enabled', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('maplewick.intro.v1', 'seen');
    localStorage.setItem('maplewick.motion.v1', 'reduced');
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => null,
    });
  });
  await page.goto('/');
  await expect(page.getByText('The agency is open')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip opening' })).toBeHidden();
  await expect(page.locator('.scene-container .flat-office')).toBeVisible();

  await page.getByRole('button', { name: 'Open Maplewick Market' }).click();
  await page.getByRole('button', { name: 'Begin investigation' }).click();
  await expect(page.getByRole('heading', { name: 'Follow the loose threads.' })).toBeVisible();
  await page.getByRole('button', { name: 'Preview repair' }).click();
  await expect(page.getByRole('dialog', { name: 'Review this change.' })).toBeVisible();
});

test('plays the opening into the agency and lets the player skip it immediately', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  const opening = page.getByRole('dialog', { name: 'Welcome to Maplewick' });
  await expect(opening).toBeVisible();
  const mediaResponse = page.waitForResponse((response) =>
    response.url().endsWith('/media/intro.mp4'),
  );
  await opening.getByRole('button', { name: 'Enter the agency' }).click();
  const media = await mediaResponse;
  expect([200, 206]).toContain(media.status());
  await expect(page.locator('video')).toHaveAttribute('src', '/media/intro.mp4');
  await expect(opening).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Open Maplewick Market' })).toBeEnabled();

  const skipPage = await browser.newPage();
  await skipPage.goto('/');
  const skipOpening = skipPage.getByRole('dialog', { name: 'Welcome to Maplewick' });
  await expect(skipOpening).toBeVisible();
  await skipOpening.getByRole('button', { name: 'Skip opening' }).click();
  await expect(skipOpening).toBeHidden();
  await expect(skipPage.getByRole('button', { name: 'Open Maplewick Market' })).toBeEnabled();
  await skipPage.close();
});
