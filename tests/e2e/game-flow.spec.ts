import { expect, test } from '@playwright/test';

test('completes a repair preview, confirms it, then undoes it from the archive', async ({ page }) => {
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

  await page.getByRole('button', { name: 'Preview repair' }).click();
  const preview = page.getByRole('dialog', { name: 'Review this change.' });
  await expect(preview.getByText('This is a preview. Your records have not changed.')).toBeVisible();
  await expect(preview.getByRole('region', { name: 'Proposed changes' })).toBeVisible();
  await preview.getByRole('button', { name: 'Confirm change' }).click();
  await expect(preview).toBeHidden();

  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByRole('heading', { name: 'A record of good work.' })).toBeVisible();
  const undo = page.getByRole('button', { name: 'Undo latest action' });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(undo).toBeDisabled();
  await expect(page.getByText(/undone/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download Excel workbook' })).toBeEnabled();
});

test('runs bounded Open and Discovery queries and saves an evidence-backed finding', async ({ page }) => {
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
  await expect(page.getByText(/exact duplicate group/)).toBeVisible();
  await page.getByRole('button', { name: 'Save finding' }).click();
  await expect(page.getByRole('button', { name: 'Finding saved' })).toBeVisible();

  await page.getByRole('button', { name: 'Discovery', exact: true }).click();
  await page.getByLabel('Investigation operation').selectOption('group_count');
  await page.getByRole('button', { name: 'Investigate' }).click();
  await expect(page.getByText(/groups across/)).toBeVisible();
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByText('Pinned findings')).toBeVisible();
});
