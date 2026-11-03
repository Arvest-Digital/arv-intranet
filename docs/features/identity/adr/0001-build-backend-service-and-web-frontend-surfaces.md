---
status: Accepted
owner: "dmitro.b"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-11-03"
feature_size: M
stage: "04-05"
ticket: "TBD"
---

<!-- Format: MADR. Spawned by sdlc:architecture-design (§4 Target-surface decision, blast-radius 3/3). -->

# 0001 — Build identity as a backend service and a web frontend

- **Status:** Accepted
- **Date:** 2026-11-03
- **Deciders:** dmitro.b (Architect), with Claude during the architecture-design Socratic pass

## Context

Identity has to sign people in through a browser, show a person who is not on the access list whom to ask (AC-03), give admins screens to keep the access list and compose and assign access roles (US-03 – US-07), and check every request on the server (US-08). The repo already has two deployables: the public `arv-web` Worker (React Router 7 SSR) and the private `arv-api` Worker (Hono + Effect), reachable only through web's service binding. The question is which of them this feature builds into.

## Decision drivers

- PRD §4: US-01, US-02, US-03 – US-07 and US-09 describe screens; US-08 describes a server-side check on every action.
- QG-1 (SAD §1) — revocation and fail-closed access must be enforced where the data is, i.e. in the api.
- Repo constraint (SAD §2): the api has no public URL; browsers only ever talk to web.

## Considered options

1. **backend-service + web-frontend** — identity's module in the api owns sign-in completion, sessions, the access list, access roles, the catalog and the check, and authors the contract; web adds the sign-in/sign-out/«not set up yet» screens, the session cookie, the root gate and the admin screens, consuming the contract.
2. **backend-service only** — only the api side; screens left to some other feature.

## Decision outcome

**Chosen:** Option 1. The PRD's user stories are half screens and half server checks, and the browser can only reach the api through web, so the cookie, redirects and screens have to live in web; leaving them to another feature would leave US-02 – US-07 and US-09 without an owner or tests.

## Consequences

**Positive**
- Downstream stages generate both the backend contract (api-forge) and a `ui` task layer with component and e2e-through-UI tests (break-tasks, plan-tests).
- One feature owns the whole sign-in journey end to end, so AC-01's «return to the page first asked for» and AC-20's sign-out are tested as one flow.

**Negative**
- The feature touches both deployables and must ship them together; a web change without the matching api change breaks sign-in.

**Neutral**
- Web stays a pure consumer of identity's contract (typed `hc` client per feature), as for every other feature.

## Links

- PRD: [[../PRD.md]] §4, §5
- SAD: [[../sad.md]] §4, §5
- Related ADR: [[0002-gate-every-web-page-at-the-root-with-a-server-only-session-cookie]], [[0003-sign-in-with-google-oidc-and-server-side-sessions]]
