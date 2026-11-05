# Tracker — identity

> Status of every task in the epic. `implement-tasks` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T01 | [Add Permission, requirePermission and the permission set on Actor.User in the kernel](./t01-kernel-permissions.md) | domain | TBD (backend lead) | M | — | done |
| T02 | [Add Unauthorized and Forbidden contract errors and map the kernel permission errors once in platform](./t02-contract-errors.md) | ports | TBD (backend lead) | M | T01 | todo |
| T03 | [Implement UnitOfWorkLive with a CurrentTx FiberRef read by query()](./t03-unit-of-work-live.md) | infra | TBD (backend lead) | M | — | todo |
| T04 | [Promote the staged identity migrations: sessions, access roles, grants and assignments](./t04-migration-identity-tables.md) | migration | TBD (backend lead) | M | — | todo |
| T05 | [Add identity test fixtures to @arv/db/testing](./t05-identity-test-fixtures.md) | tests | TBD (backend lead) | S | T04 | todo |
| T06 | [Model company email, user name, access-role name key and retired permissions in the identity domain](./t06-domain-user-access-role.md) | domain | TBD (backend lead) | M | T01 | todo |
| T07 | [Model sign-in eligibility, sessions, the first-admin rule and the last-admin rule](./t07-domain-sign-in-session.md) | domain | TBD (backend lead) | M | T01 | todo |
| T08 | [Declare identity:manage-access and define identity's application ports with in-memory fakes](./t08-ports-and-permission-declaration.md) | app | TBD (backend lead) | M | T06, T07 | todo |
| T09 | [Implement the Drizzle user and session repositories with the one-query actor lookup](./t09-user-session-repositories.md) | infra | TBD (backend lead) | L | T03, T04, T05, T08 | todo |
| T10 | [Implement the Drizzle access-role repository with the manage-access holder queries](./t10-access-role-repository.md) | infra | TBD (backend lead) | L | T03, T04, T05, T08 | todo |
| T11 | [Implement the GoogleSignIn adapter on a pinned OIDC library](./t11-google-sign-in-adapter.md) | infra | TBD (backend lead) | L | T08 | todo |
| T12 | [Implement resolveActor and sign-out, and wire identity's adapters in the module layer](./t12-resolve-actor-sign-out.md) | app | TBD (backend lead) | M | T09, T10, T11 | todo |
| T13 | [Implement begin and complete sign-in, with the first-admin bootstrap and the not-set-up answer](./t13-sign-in-use-cases.md) | app | TBD (backend lead) | L | T09, T10, T11 | todo |
| T14 | [Implement the access-list use cases: list, add, rename, remove and assign access roles under the last-admin guard](./t14-access-list-use-cases.md) | app | TBD (backend lead) | L | T09, T10 | todo |
| T15 | [Implement the access-role use cases: compose, rename, delete with warning, pre-select and list permissions](./t15-access-role-use-cases.md) | app | TBD (backend lead) | L | T10 | todo |
| T16 | [Add the identity contract schemas for sign-in, me, the access list, access roles and permissions](./t16-contracts-identity-dtos.md) | ports | TBD (backend lead) | M | — | todo |
| T17 | [Expose sign-in begin and complete, me and sign-out routes](./t17-http-sign-in-me-sign-out.md) | ports | TBD (backend lead) | M | T02, T12, T13, T16 | todo |
| T18 | [Expose the access-list endpoints behind manage access](./t18-http-access-list.md) | ports | TBD (backend lead) | M | T02, T14, T16 | todo |
| T19 | [Expose the access-role, pre-selected-role and permission-catalog endpoints](./t19-http-access-roles.md) | ports | TBD (backend lead) | M | T02, T15, T16 | todo |
| T20 | [Wire authenticate, the permission catalog and identity config in the api host](./t20-host-authenticate-composition.md) | wiring | TBD (backend lead) | M | T12, T17 | todo |
| T21 | [Add the QG-1 revocation, session-lifetime and fail-closed integration suites](./t21-qg1-revocation-sessions-fail-closed.md) | tests | TBD (backend lead) | L | T18, T19, T20 | todo |
| T22 | [Add the web session and sign-in-state cookies, Bearer forwarding, the returnTo check and the Origin check](./t22-web-session-plumbing.md) | ui | TBD (frontend lead) | M | T16 | todo |
| T23 | [Build the sign-in, sign-in-return, sign-out, not-set-up and refused screens](./t23-web-sign-in-screens.md) | ui | TBD (frontend lead) | L | T17, T22 | todo |
| T24 | [Gate every page at the root and show navigation by permission](./t24-web-root-gate.md) | ui | TBD (frontend lead) | M | T17, T20, T22 | todo |
| T25 | [Build the access-list screens: list, add with pre-selected role, rename, remove and assign roles](./t25-web-access-list-screens.md) | ui | TBD (frontend lead) | M | T18, T24 | todo |
| T26 | [Build the access-role screens: compose, rename, delete with warning, pre-select and retired flags](./t26-web-access-role-screens.md) | ui | TBD (frontend lead) | L | T19, T24 | todo |
| T27 | [Add the identity end-to-end tests over seeded sessions](./t27-e2e-identity.md) | tests | TBD (backend lead) | M | T23, T25, T26 | todo |
| T28 | [Add the seeded k6 load test and its CI job for the three latency targets](./t28-k6-load-test-ci.md) | tests | TBD (backend lead) | L | T20, T23 | todo |
| T29 | [Update ARCHITECTURE.md and repo ADR 0001, and add the deploy checklist and the first-admin recovery runbook](./t29-docs-deploy-runbook.md) | docs | dmitro.b | M | T20 | todo |

**Total:** 29 tasks, ~19.25 person-days (S = 2 h, M = half-day, L = 1 day).
