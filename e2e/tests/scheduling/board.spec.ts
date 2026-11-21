import {
  makeAccessRole,
  makeAllocation,
  makeEmployeeRecord,
  makeProject,
  makeSession,
  makeUser,
  resetDatabase,
  seedAccessRoles,
  seedAllocations,
  seedEmployeeRecords,
  seedProjects,
  seedSessions,
  seedUserAccessRoles,
  seedUsers,
} from '@arv/db/testing';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { withDb } from '../../db';
import { clickToOpen, open, useSession } from '../identity/session';

// Critical flow 1 end to end (AC-01, AC-07, AC-10) and the board's accessibility audit (sad §10
// QS-7): a planner opens the board, plans an allocation that overbooks a week, confirms it, and
// the cell says «Overbooked» in words. Dates follow today (UTC, as the web counts them).

const DAY = 86_400_000;
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
const addDays = (date: string, days: number) => iso(Date.parse(`${date}T00:00:00Z`) + days * DAY);
const mondayOf = (date: string) =>
  addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));

/** «W48 2026», as the board names a week in its cells. */
function weekName(monday: string) {
  const thursday = addDays(monday, 3);
  const yearStart = Date.UTC(Number(thursday.slice(0, 4)), 0, 1);
  const week = Math.floor((Date.parse(`${thursday}T00:00:00Z`) - yearStart) / DAY / 7) + 1;
  return `W${week} ${thursday.slice(0, 4)}`;
}

/** Each cell state's text label (apps/web `STATE_LABEL`): never colour alone. */
const STATE_LABEL: Record<string, string> = {
  free: 'Free',
  'partly-booked': 'Partly booked',
  'fully-booked': 'Fully booked',
  overbooked: 'Overbooked',
  'non-working': 'Non-working',
  'incomplete-record': 'Incomplete record',
  'needs-attention': 'Needs attention',
};

const PLANNER_PERMISSIONS = ['scheduling:view-whole-board', 'scheduling:edit-allocations'];
const BOARD_TABLE = 'Team schedule, one column per week';
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const today = iso(Date.now());
const thisMonday = mondayOf(today);
const nextMonday = addDays(thisMonday, 7);

/**
 * A planner (view-whole-board + edit-allocations) signed in, and three resources: one booked
 * 32h a week on «Test Project Alpha» for four weeks, one with an incomplete record, one free;
 * «Test Project Beta» is open to plan on.
 */
function seedBoard() {
  return withDb(async (db) => {
    await resetDatabase(db);
    const [planner] = await seedUsers(db, [makeUser({ name: 'Test Planner' })]);
    if (!planner) throw new Error('seedBoard: no planner');
    const [role] = await seedAccessRoles(db, [
      makeAccessRole({ name: 'Planner', permissionKeys: PLANNER_PERMISSIONS }),
    ]);
    if (!role) throw new Error('seedBoard: no role');
    await seedUserAccessRoles(db, [{ userId: planner.id, accessRoleId: role.id }]);
    const [session] = await seedSessions(db, [makeSession({ userId: planner.id })]);
    if (!session) throw new Error('seedBoard: no session');

    const by = planner.id;
    const [booked] = await seedEmployeeRecords(db, [
      makeEmployeeRecord({ fullName: 'Test Resource A', lastChangedBy: by }),
      makeEmployeeRecord({
        fullName: 'Test Resource B',
        contractMinutes: null,
        employmentStart: null,
        lastChangedBy: by,
      }),
      makeEmployeeRecord({ fullName: 'Test Resource C', lastChangedBy: by }),
    ]);
    const [alpha] = await seedProjects(db, [
      makeProject({ name: 'Test Project Alpha' }),
      makeProject({ name: 'Test Project Beta' }),
    ]);
    if (!booked || !alpha) throw new Error('seedBoard: no resource or project');
    await seedAllocations(db, [
      makeAllocation({
        employeeId: booked.id,
        projectId: alpha.id,
        segments: [
          {
            startsOn: thisMonday,
            endsOn: addDays(thisMonday, 27),
            rateMinutes: 32 * 60,
            ratePeriod: 'week',
          },
        ],
        lastChangedBy: by,
      }),
    ]);
    return { token: session.token };
  });
}

/** Every week cell on the board carries its state as text (sad §8, QS-7). */
async function expectTextStates(page: Page) {
  const cells = page.getByRole('table', { name: BOARD_TABLE }).locator('[data-state]');
  const count = await cells.count();
  // Three people, one cell per week in the window.
  expect(count).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < count; i += 1) {
    const cell = cells.nth(i);
    const state = (await cell.getAttribute('data-state')) ?? '';
    expect(STATE_LABEL[state], `a known state, got «${state}»`).toBeDefined();
    await expect(cell).toContainText(STATE_LABEL[state] ?? '');
  }
}

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    violations.map((v) => ({ id: v.id, help: v.help, targets: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
}

test('a planner plans an allocation that overbooks a week and confirms it (AC-01, AC-07, AC-10)', async ({
  page,
  baseURL,
}) => {
  const { token } = await seedBoard();
  if (!baseURL) throw new Error('missing baseURL');
  await useSession(page.context(), baseURL, token);

  await open(page, '/schedule');
  const board = page.getByRole('table', { name: BOARD_TABLE });
  await expect(board).toBeVisible();
  const cellOf = (name: string, monday: string) =>
    board.getByRole('cell', { name: new RegExp(`^${name}, ${weekName(monday)}: `) });

  // AC-01: each person's week as allocated/capacity with the state in words.
  const nextWeek = cellOf('Test Resource A', nextMonday);
  await expect(nextWeek).toContainText('Partly booked');
  await expect(nextWeek).toContainText('32/40');
  await expect(cellOf('Test Resource B', nextMonday)).toContainText('Incomplete record');
  await expect(cellOf('Test Resource C', nextMonday)).toContainText('Free');
  await expectTextStates(page);

  // AC-07: allocate A to Beta, 16h a week next week — 48h against 40h.
  const dialog = page.getByRole('dialog', { name: 'New allocation' });
  await clickToOpen(page.getByRole('button', { name: 'New allocation', exact: true }), dialog);
  await dialog.getByLabel('Resource').click();
  await page.getByRole('option', { name: /Test Resource A/ }).click();
  await dialog.getByLabel('Project').click();
  await page.getByRole('option', { name: 'Test Project Beta' }).click();
  await dialog.getByLabel('Start').fill(nextMonday);
  await dialog.getByLabel('End').fill(addDays(nextMonday, 4));
  await dialog.getByLabel('Rate', { exact: true }).fill('16');
  await dialog.getByRole('button', { name: 'Create allocation' }).click();

  // AC-10: nothing saved until confirmed; the week over is named with its hours.
  const confirm = page.getByRole('alertdialog', { name: 'Test will be overbooked in 1 week' });
  await expect(confirm).toBeVisible();
  const overRow = confirm.getByRole('row').filter({ hasText: weekName(nextMonday).split(' ')[0] });
  await expect(overRow).toContainText('40h');
  await expect(overRow).toContainText('48h');
  await expect(overRow).toContainText('+8h');
  await confirm.getByRole('button', { name: 'Save anyway' }).click();

  await expect(
    page.getByRole('status').filter({ hasText: 'Allocated Test Resource A' }),
  ).toHaveText('Allocated Test Resource A to Test Project Beta.');
  await expect(dialog).toBeHidden();
  await expect(nextWeek).toContainText('Overbooked');
  await expect(nextWeek).toContainText('48/40');
  await expect(nextWeek).toContainText('+8h over');
  // The week after is untouched.
  await expect(cellOf('Test Resource A', addDays(nextMonday, 7))).toContainText('Partly booked');
  await expectTextStates(page);
});

test('the board passes the accessibility audit in light and dark (QS-7)', async ({
  page,
  baseURL,
}) => {
  const { token } = await seedBoard();
  if (!baseURL) throw new Error('missing baseURL');
  await useSession(page.context(), baseURL, token);

  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await open(page, '/schedule');
    await expect(page.getByRole('table', { name: BOARD_TABLE })).toBeVisible();
    // The audit covers the shell too: the section switcher and the side navigation.
    await expect(page.getByRole('complementary', { name: 'Main navigation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Schedule', exact: true })).toBeVisible();
    // The theme follows the OS by default: make sure this pass really audits that scheme.
    if (colorScheme === 'dark') await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
    await expectNoAxeViolations(page);
  }
});
