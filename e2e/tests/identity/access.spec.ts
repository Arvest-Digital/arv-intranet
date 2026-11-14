import { makeAccessRole, seedAccessRoles } from '@arv/db/testing';
import { expect, test } from '@playwright/test';
import { withDb } from '../../db';
import {
  clickToOpen,
  open,
  resetIdentity,
  seedSignedInAdmin,
  seedSignedInUser,
  useSession,
} from './session';

// The api runs with its wrangler vars in e2e: COMPANY_EMAIL_DOMAIN is arvest.digital.
const NEWCOMER = { name: 'Test Newcomer', email: 'test-newcomer@arvest.digital' };

test.beforeEach(resetIdentity);

test('an admin adds a user with the pre-selected role, creates «Planner» and assigns it (AC-04, AC-09, AC-12)', async ({
  page,
  baseURL,
}) => {
  const admin = await seedSignedInAdmin({ name: 'Test Admin' });
  await withDb((db) =>
    seedAccessRoles(db, [makeAccessRole({ name: 'Staff', isPreselected: true })]),
  );
  if (!baseURL) throw new Error('missing baseURL');
  await useSession(page.context(), baseURL, admin.token);

  // Add the newcomer, keeping the pre-selected «Staff» (AC-04, AC-13).
  await open(page, '/');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Access' })
    .click();
  await expect(page.getByRole('heading', { name: 'Access', exact: true })).toBeVisible();
  const tabs = page.getByRole('navigation', { name: 'Access', exact: true });

  const add = page.getByRole('dialog', { name: 'Add user' });
  await clickToOpen(page.getByRole('button', { name: 'Add user' }), add);
  await expect(add.getByRole('checkbox', { name: 'Staff' })).toBeChecked();
  await expect(add.getByRole('checkbox', { name: 'Admin' })).not.toBeChecked();
  await add.getByLabel('Email').fill(NEWCOMER.email);
  await add.getByLabel('Name').fill(NEWCOMER.name);
  await add.getByRole('button', { name: 'Add user' }).click();
  await expect(add).toBeHidden();

  const newcomerRow = page.getByRole('row', { name: new RegExp(NEWCOMER.name) });
  await expect(newcomerRow).toContainText(NEWCOMER.email);
  await expect(newcomerRow.getByRole('cell', { name: 'Staff', exact: true })).toBeVisible();

  // Create «Planner»: every permission in plain words with its feature (AC-09).
  await tabs.getByRole('link', { name: 'Roles' }).click();
  await expect(page).toHaveURL('/access/roles');
  await page.getByRole('link', { name: 'New role' }).click();
  await expect(page.getByRole('heading', { name: 'New role' })).toBeVisible();
  const create = page.getByRole('main');
  await expect(create.getByRole('group', { name: 'Access', exact: true })).toBeVisible();
  await expect(
    create.getByText(
      'Add and remove people on the access list, and create, change and assign access roles.',
    ),
  ).toBeVisible();
  await create.getByLabel('Name').fill('Planner');
  // Manage access is the only declared permission until scheduling declares its own.
  await create.getByRole('checkbox', { name: /Manage access/ }).check();
  await create.getByRole('button', { name: 'Save role' }).click();
  await expect(page).toHaveURL('/access/roles');
  await expect(page.getByRole('heading', { name: 'Access', exact: true })).toBeVisible();

  // Listed with its permissions in plain words, held by nobody yet.
  const plannerRow = page.getByRole('row', { name: /Planner/ });
  await expect(plannerRow.getByRole('cell').nth(1)).toHaveText('Manage access');
  await expect(plannerRow.getByRole('cell').nth(2)).toHaveText('0');

  // Assign «Planner» on top of «Staff»; the admin sees the combined permissions (AC-12).
  await tabs.getByRole('link', { name: 'Users' }).click();
  const rolesItem = page.getByRole('menuitem', { name: 'Change roles' });
  await clickToOpen(page.getByRole('button', { name: `Actions for ${NEWCOMER.name}` }), rolesItem);
  await rolesItem.click();
  const assign = page.getByRole('dialog', { name: 'Change roles' });
  await expect(assign).toContainText(`${NEWCOMER.name} · ${NEWCOMER.email}`);
  await expect(assign.getByRole('checkbox', { name: 'Staff' })).toBeChecked();
  await assign.getByRole('checkbox', { name: 'Planner' }).check();
  await expect(assign.getByRole('region', { name: 'What they can do' })).toContainText(
    'Manage access',
  );
  await assign.getByRole('button', { name: 'Save roles' }).click();
  await expect(assign).toBeHidden();

  const newcomerRoles = newcomerRow.getByRole('cell').nth(2);
  await expect(newcomerRoles).toContainText('Staff');
  await expect(newcomerRoles).toContainText('Planner');
});

test('a removed user is told on their next navigation that they no longer have access (AC-07)', async ({
  page,
  browser,
  baseURL,
}) => {
  const admin = await seedSignedInAdmin({ name: 'Test Admin' });
  const member = await seedSignedInUser({ name: 'Test Member' });
  if (!baseURL) throw new Error('missing baseURL');

  // The member is in the middle of using the intranet.
  const memberContext = await browser.newContext();
  try {
    await useSession(memberContext, baseURL, member.token);
    const memberPage = await memberContext.newPage();
    await memberPage.goto('/');
    await expect(memberPage.getByText('Signed in as Test Member.')).toBeVisible();

    // The admin removes them.
    await useSession(page.context(), baseURL, admin.token);
    await open(page, '/access/users');
    const removeItem = page.getByRole('menuitem', { name: 'Remove', exact: true });
    await clickToOpen(page.getByRole('button', { name: 'Actions for Test Member' }), removeItem);
    await removeItem.click();
    const remove = page.getByRole('dialog', { name: 'Remove Test Member?' });
    await remove.getByRole('button', { name: 'Remove' }).click();
    await expect(remove).toBeHidden();
    await expect(page.getByRole('row', { name: /Test Member/ })).toHaveCount(0);

    // Their next navigation is refused, and the cookie is cleared.
    await memberPage.goto('/');
    await expect(memberPage.getByRole('heading', { name: 'Access removed' })).toBeVisible();
    await expect(memberPage.getByText('You no longer have access to the intranet.')).toBeVisible();
    await expect(memberPage.getByRole('button', { name: 'Sign in again' })).toBeVisible();
    await expect(memberPage.getByText('Signed in as')).toHaveCount(0);

    await memberPage.goto('/');
    await expect(memberPage).toHaveURL('/sign-in?returnTo=%2F');
  } finally {
    await memberContext.close();
  }
});

test('a user without manage access sees no «Access» and is refused the access screens (AC-08)', async ({
  page,
  baseURL,
}) => {
  // An admin exists, so nothing about the first-admin rule applies.
  await seedSignedInAdmin({ name: 'Test Admin' });
  const member = await seedSignedInUser({ name: 'Test Member' });
  if (!baseURL) throw new Error('missing baseURL');
  await useSession(page.context(), baseURL, member.token);

  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Home' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Access' })).toHaveCount(0);

  for (const path of ['/access/users', '/access/roles']) {
    await page.goto(path);
    await expect(
      page.getByRole('heading', { name: "You don't have permission to manage access." }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to home' })).toBeVisible();
    await expect(page.getByText('Test Admin')).toHaveCount(0);
  }
});
