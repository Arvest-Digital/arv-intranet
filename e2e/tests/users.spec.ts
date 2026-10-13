import { connectDb, makeUser, resetDatabase, seedUsers } from '@arv/db/testing';
import { expect, test } from '@playwright/test';
import { TEST_DATABASE_URL } from '../db';

test.beforeEach(async () => {
  const { db, close } = await connectDb(TEST_DATABASE_URL);
  try {
    await resetDatabase(db);
    await seedUsers(db, [makeUser({ name: 'Ann Seeded', email: 'ann@arvest.digital' })]);
  } finally {
    await close();
  }
});

test('lists seeded users', async ({ page }) => {
  await page.goto('/users');
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Ann Seeded' })).toBeVisible();
});

test('creates a user', async ({ page }) => {
  await page.goto('/users');
  await page.getByLabel('Name').fill('Bob New');
  await page.getByLabel('Email').fill('bob@arvest.digital');
  await page.getByRole('button', { name: 'Add user' }).click();

  await expect(page.getByRole('cell', { name: 'Bob New' })).toBeVisible();
  await expect(page.getByLabel('Name')).toHaveValue('');
});

test('shows an error for a duplicate email', async ({ page }) => {
  await page.goto('/users');
  await page.getByLabel('Name').fill('Ann Again');
  await page.getByLabel('Email').fill('ann@arvest.digital');
  await page.getByRole('button', { name: 'Add user' }).click();

  await expect(page.getByRole('alert')).toContainText('already exists');
});
