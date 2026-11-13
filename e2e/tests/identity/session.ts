import {
  makeSession,
  makeUser,
  resetDatabase,
  seedAdmin,
  seedSessions,
  seedUsers,
  type UserSeed,
} from '@arv/db/testing';
import { type BrowserContext, expect, type Locator, type Page } from '@playwright/test';
import { withDb } from '../../db';

// Google isn't driven in e2e (the sign-in completion leg is covered by the api integration
// tests): sessions are seeded in the DB and their token is set as web's session cookie.

/** Must match `apps/web/app/shared/lib/session.server.ts`. */
const SESSION_COOKIE = '__Host-arv_session';

/**
 * The cookie value React Router's `createCookie` writes for a token (no secrets): base64 of the
 * JSON string, then URI-encoded by the cookie serializer.
 */
const cookieValue = (token: string) =>
  encodeURIComponent(Buffer.from(JSON.stringify(token), 'utf8').toString('base64'));

/** Signs the browser context in with a seeded session token. */
export async function useSession(context: BrowserContext, baseURL: string, token: string) {
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: cookieValue(token),
      // `__Host-`: Path=/ and no leading-dot domain, so the cookie stays host-only.
      domain: new URL(baseURL).hostname,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
}

export type SeededSignIn = { name: string; email: string; userId: string; token: string };

export const resetIdentity = () => withDb(resetDatabase);

/** An admin (role «Admin» with manage access) and one live session. */
export function seedSignedInAdmin(user: Partial<UserSeed> = {}): Promise<SeededSignIn> {
  return withDb(async (db) => {
    const { user: admin } = await seedAdmin(db, user);
    const [session] = await seedSessions(db, [makeSession({ userId: admin.id })]);
    if (!session) throw new Error('seedSignedInAdmin: no session');
    return { name: admin.name, email: admin.email, userId: admin.id, token: session.token };
  });
}

/** A user with no access roles and `sessions` live sessions (one per device). */
export function seedSignedInUser(
  user: Partial<UserSeed> = {},
  sessions = 1,
): Promise<SeededSignIn & { tokens: ReadonlyArray<string> }> {
  return withDb(async (db) => {
    const [seeded] = await seedUsers(db, [makeUser(user)]);
    if (!seeded) throw new Error('seedSignedInUser: no user');
    const rows = await seedSessions(
      db,
      Array.from({ length: sessions }, () => makeSession({ userId: seeded.id })),
    );
    const tokens = rows.map((row) => row.token);
    const [token] = tokens;
    if (!token) throw new Error('seedSignedInUser: no session');
    return { name: seeded.name, email: seeded.email, userId: seeded.id, token, tokens };
  });
}

/**
 * Opens a page and waits for hydration to settle, so dialogs and menus (client-side) respond to
 * the first click.
 */
export async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

/**
 * Clicks `trigger` until `target` (a dialog or menu) shows. On a cold dev server Vite may still
 * be optimizing deps and reload the page, swallowing the first click.
 */
export async function clickToOpen(trigger: Locator, target: Locator) {
  await expect(async () => {
    await trigger.click();
    await expect(target).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}
