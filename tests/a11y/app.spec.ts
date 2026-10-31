import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function expectNoSevereViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const severe = results.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious');
  expect(severe, severe.map((violation) => `${violation.id}: ${violation.help}`).join('\n')).toEqual([]);
}

test('keeps the desk, evidence board, and change preview usable by keyboard and free of severe axe violations', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('maplewick.intro.v1', 'seen');
    localStorage.setItem('maplewick.motion.v1', 'reduced');
    localStorage.setItem('maplewick.office.v1', 'flat');
  });
  await page.goto('/');
  await expect(page.getByText('The agency is open')).toBeVisible();
  await expectNoSevereViolations(page);

  await page.keyboard.press('2');
  await expect(page.getByRole('button', { name: 'Evidence board' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Desk' }).click();
  await page.getByRole('button', { name: 'Open Maplewick Market' }).click();
  await page.getByRole('button', { name: 'Begin investigation' }).click();
  await expect(page.getByRole('heading', { name: 'Follow the loose threads.' })).toBeVisible();
  await expectNoSevereViolations(page);

  await page.getByRole('button', { name: 'Preview repair' }).click();
  const dialog = page.getByRole('dialog', { name: 'Review this change.' });
  await expect(dialog).toBeVisible();
  await expectNoSevereViolations(page);
  await expect(dialog.getByRole('button', { name: 'Close preview' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Confirm change' })).toBeFocused();
});
