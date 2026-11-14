import { expect, test } from '@playwright/test';
import { clickToOpen, open, resetIdentity, seedSignedInUser, useSession } from './session';

test.beforeEach(resetIdentity);

test('an anonymous visit to a page goes to sign-in, keeping the page to return to (AC-01)', async ({
  page,
}) => {
  await page.goto('/board');

  await expect(page).toHaveURL('/sign-in?returnTo=%2Fboard');
  await expect(page.getByRole('heading', { name: 'Sign in to ARV Intranet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  // The sign-in button posts the page back, so Google's return lands on it.
  await expect(page.locator('input[name="returnTo"]')).toHaveValue('/board');
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
});

test('signing out shows the sign-in page, ends that session only and keeps other devices signed in (AC-20)', async ({
  page,
  browser,
  baseURL,
}) => {
  const user = await seedSignedInUser({ name: 'Test Leaver' }, 2);
  const [thisDevice, otherDevice] = user.tokens;
  if (!baseURL || !thisDevice || !otherDevice) throw new Error('missing baseURL or sessions');

  await useSession(page.context(), baseURL, thisDevice);
  await open(page, '/');
  await expect(page.getByText('Signed in as Test Leaver.')).toBeVisible();

  const signOut = page.getByRole('menuitem', { name: 'Sign out' });
  await clickToOpen(page.getByRole('button', { name: 'Test Leaver' }), signOut);
  await signOut.click();

  await expect(page).toHaveURL('/sign-in?signedOut');
  await expect(page.getByRole('status')).toHaveText('You signed out.');

  // The next visit asks to sign in again and shows no page.
  await page.goto('/');
  await expect(page).toHaveURL('/sign-in?returnTo=%2F');
  await expect(page.getByText('Signed in as')).toHaveCount(0);

  // The ended session can't be used again, even from a copied cookie.
  await useSession(page.context(), baseURL, thisDevice);
  await page.goto('/');
  await expect(page).toHaveURL('/sign-in?returnTo=%2F');

  // The other device stays signed in.
  const other = await browser.newContext();
  try {
    await useSession(other, baseURL, otherDevice);
    const otherPage = await other.newPage();
    await otherPage.goto('/');
    await expect(otherPage.getByText('Signed in as Test Leaver.')).toBeVisible();
  } finally {
    await other.close();
  }
});
