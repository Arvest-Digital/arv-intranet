# Identity runbook

How to deploy identity (sign-in, sessions, access list, access roles) and how to recover when no admin can sign in.

- Owner: Tech Lead
- Sources: [identity SAD §7 and §11](../features/identity/sad.md), [PRD AC-02, AC-15 and §8 Q4](../features/identity/PRD.md), [ADR-0003](../features/identity/adr/0003-sign-in-with-google-oidc-and-server-side-sessions.md), [ADR-0007](../features/identity/adr/0007-split-sign-in-into-a-web-browser-leg-and-an-identity-server-leg.md)
- Status: draft, waiting for Tech Lead review

## Contents

- [Configuration](#configuration)
- [One-time setup](#one-time-setup)
- [Deploy checklist](#deploy-checklist)
- [After the deploy](#after-the-deploy)
- [First admin](#first-admin)
- [Recovery: no admin can sign in](#recovery-no-admin-can-sign-in)

## Configuration

All identity settings live in the api Worker (`arv-api`). The web Worker holds no Google or identity settings (ADR-0007).

| Name | Kind | Value | Where it is set |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | secret | OAuth client ID from Google Cloud | `wrangler secret put` |
| `GOOGLE_CLIENT_SECRET` | secret | OAuth client secret from Google Cloud | `wrangler secret put` |
| `COMPANY_EMAIL_DOMAIN` | var | the single company email domain | committed in `apps/api/wrangler.jsonc` |
| `SIGN_IN_RETURN_URL` | var | `https://<web host>/sign-in/return`, exactly as registered with Google | `apps/api/wrangler.jsonc`, once the custom domain is known |
| `FIRST_ADMIN_EMAIL` | var | company address of the first admin, or empty | `--var` at deploy time, never committed |
| `SKIP_HOSTED_DOMAIN_CHECK` | var | `true` skips Google's `hd` check; local development only | `apps/api/.dev.vars` only, never in `wrangler.jsonc` or on a deployed Worker |

A missing value fails closed: with no company domain every sign-in is refused, and with no first-admin address no admin is created.

> [!WARNING]
> `wrangler deploy` replaces the Worker's vars with the ones in `wrangler.jsonc`. A plain `pnpm deploy` therefore resets `FIRST_ADMIN_EMAIL` to empty. That is safe once an admin exists. Before the first admin has signed in, deploy the api with `--var` as shown below.

Local development uses `apps/api/.dev.vars` (copy `.dev.vars.example`) and a **separate** Google OAuth client whose redirect URI is the local web origin plus `/sign-in/return`. Production and local clients never share a secret.

To try sign-in locally with a personal Google account (no company Workspace account), set `SKIP_HOSTED_DOMAIN_CHECK=true` and `COMPANY_EMAIL_DOMAIN=gmail.com` in `.dev.vars`, and use a client in a personal Google Cloud project with an **External** consent screen in Testing mode. Identity then skips only the `hd` check: the email must still be verified and on `COMPANY_EMAIL_DOMAIN`. The flag is ignored unless `SIGN_IN_RETURN_URL` is `http://` on `localhost` or `127.0.0.1`, so it can't weaken a deployed Worker.

## One-time setup

Do these before the first identity deploy. Steps 1 and 2 depend on the company zone, which is not decided yet (see the `TODO(Tech Lead)` in `apps/web/wrangler.jsonc`).

1. **Custom domain for `arv-web`.** Pick a host in the company's Cloudflare zone. In `apps/web/wrangler.jsonc`, uncomment `routes` and set the hostname (`"custom_domain": true`). Run `pnpm --filter @arv/web cf-typegen`. Set `SIGN_IN_RETURN_URL` in `apps/api/wrangler.jsonc` to `https://<that host>/sign-in/return`. Commit both on a branch and open a PR.
2. **Rate Limiting rule.** In the zone's Security settings, add a Rate Limiting rule for requests to the web host whose path starts with `/sign-in` (this covers `/sign-in` and `/sign-in/return`). Count per IP. Set the threshold so about 30 people behind one office IP can sign in within a few minutes at the start of the day. Watch 429s on those paths during the first week and adjust.
3. **Google OAuth client** in the company's Google Cloud project:
   1. OAuth consent screen: user type **Internal**. Google then admits only accounts of the company's Google organisation, a second check behind identity's own `hd`, `email_verified` and domain checks (AC-02).
   2. Credentials: create an OAuth client of type **Web application**.
   3. Authorized redirect URI: the exact `SIGN_IN_RETURN_URL` value.
   4. Store the client ID and secret only as Worker secrets (next step), never in the repo or a chat.
4. **Secrets** on the api Worker:

   ```sh
   pnpm --filter @arv/api exec wrangler secret put GOOGLE_CLIENT_ID
   pnpm --filter @arv/api exec wrangler secret put GOOGLE_CLIENT_SECRET
   ```

5. **Database.** Neon on Postgres 18 and a Hyperdrive config with caching disabled, as in the README's Deploying section. Identity must only ever use this uncached config (ADR-0005); a cached config would let a removed user keep working.

## Deploy checklist

Order matters: migrate, then api, then web. The web calls api endpoints that must already exist.

1. [ ] `pnpm lint && pnpm typecheck && pnpm test` and `pnpm test:integration` pass on the commit being deployed.
2. [ ] Apply the migrations to Neon's **direct** (non-pooled) URL and check them:

   ```sh
   DATABASE_URL=<neon direct url> pnpm db:migrate
   DATABASE_URL=<neon direct url> pnpm db:status
   ```

   `db:status` must show no pending or changed migrations. If it does not, use the `db-migration-recovery` skill before going further.
3. [ ] Deploy the api.
   - Before the first admin exists:

     ```sh
     pnpm --filter @arv/api exec wrangler deploy --var FIRST_ADMIN_EMAIL:<first admin address>
     ```

   - Once an admin exists: `pnpm --filter @arv/api deploy`.
4. [ ] Deploy the web: `pnpm --filter @arv/web deploy`.

`pnpm deploy` runs steps 3 and 4 in order, without the `--var`.

## After the deploy

1. [ ] In a private window, open the web host. You land on the sign-in page, not on intranet content.
2. [ ] Sign in with a company account that is on the access list. You land on the page you first opened.
3. [ ] Try a personal Google account. It is refused with the generic message (AC-02).
4. [ ] In Workers Logs, check for `identity.sign_in.succeeded` (it carries a `userId` only) and `api.access_check` with `accessCheckMs` and `dbConnectMs`.
5. [ ] Sign out, then open an intranet page. You are sent back to the sign-in page.

## First admin

The first admin is created from configuration, only while **no user holds `identity:manage-access`** (AC-15):

1. Deploy the api with `FIRST_ADMIN_EMAIL` set to the admin-to-be's company address (see the deploy checklist). Letter case and surrounding spaces don't matter.
2. That person signs in with Google. They are added to the access list (or kept on it with their roles) under their Google name and given the access role «Admin», which holds only manage access. «Admin» is created if no role has that name, otherwise manage access is added to it.
3. From now on the address grants nothing extra. Clear it at the next normal deploy (`pnpm deploy` does this). It takes effect again only if a later state leaves no user holding manage access.

The admin then adds a second admin, so the intranet never depends on one person.

## Recovery: no admin can sign in

This closes PRD §8 Q4. Pick the case that matches.

### Case A: no user holds manage access

For example, two admins removed each other at the same moment (PRD §6.1).

1. Choose a current employee to become admin.
2. Redeploy the api with `FIRST_ADMIN_EMAIL` set to their address (deploy checklist, step 3, first form). No migration or web deploy is needed.
3. They sign in. [First admin](#first-admin) applies.

### Case B: admins exist on paper, but none can sign in

For example, the only admin has left and their Google account is gone. The first-admin rule does not apply, because a user still holds manage access. This is the last-resort data fix. Only the Tech Lead runs it, and only after Case A is ruled out.

1. Confirm in `pnpm db:studio` (pointed at Neon's direct URL) which users hold manage access and that none of them can sign in.
2. Remove each such user, the same way an admin removal does it: revoke their sessions, then delete the user (their role assignments go with them).

   ```sql
   BEGIN;
   UPDATE identity.sessions
     SET revoked_reason = 'access-removed'
     WHERE user_id = (SELECT id FROM identity.users WHERE email = lower(btrim('<address>')));
   DELETE FROM identity.users WHERE email = lower(btrim('<address>'));
   -- Expect 0 rows: nobody holds manage access any more.
   SELECT u.email
     FROM identity.users u
     JOIN identity.user_access_roles ur ON ur.user_id = u.id
     JOIN identity.access_role_permissions rp ON rp.access_role_id = ur.access_role_id
     WHERE rp.permission_key = 'identity:manage-access';
   COMMIT;
   ```

3. Continue with Case A.
4. Write down what was done and why. There is no audit log in v1 (PRD §3).
