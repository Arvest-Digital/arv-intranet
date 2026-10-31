---
status: Confirmed
owner: "dmitro.b"
reviewers: []
updated_at: "2026-10-31"
feature_size:                    # set by sdlc:classify-size, not here
stage: "01"
depth: hard
ticket: ""
value_score:
  rice: 24
  state: confirmed
  confirmed_at: "2026-10-31"
feasibility_state: confirmed
---

<!-- Stage 01 → see sdlc/plugin/skills/interview/SKILL.md -->
<!-- Why: capture the idea before it's forgotten or retold incorrectly -->

# Idea Brief — Identity: sign-in, access roles and permissions

Domain terms (**user**, **admin**, **access list**, **access role**, **permission**, **resource**) follow [`CONTEXT.md`](../../../CONTEXT.md).

## 1. Raw idea
We don't yet have authorization and authentication, or a roles and permissions system, in the project. This is an important part of the product, and all future features will depend on it.

## 2. Problem
The intranet has no sign-in, so every request is treated as anonymous and nobody can be given a permission. Resource scheduling is fully designed around six named permissions and cannot launch until something real grants them. Without one shared access model, each feature would invent its own rules, and sensitive data such as leave reasons would depend on each feature remembering to protect it.

## 3. Users
- **Staff (primary, ~30 people):** every employee signs in with their Google account on the company email domain. Each staff member is affected on every visit, because nothing else in the intranet works until they are signed in.
- **Admins (1–2 people):** add and remove users on the access list, compose access roles from the permissions features declare, and assign roles to users. They act at onboarding, offboarding and on role changes, a few times a month.
- **Feature teams (internal, indirect):** declare their feature's permissions and check them, instead of building their own access control. Resource scheduling is the first.

## 4. Why now
Strategic, not incident-driven. Resource scheduling is ready for build, but its launch is explicitly blocked until a real permission source exists. Every later intranet feature (people, leave, projects) needs the same foundation. There is no hard deadline.

## 5. Out of scope
- Contractors, clients or any user outside the company domain.
- Own passwords, password reset or a second sign-in method.
- An audit log of who granted or removed access (current state only in v1).
- Permissions limited to a team or project (all permissions are company-wide, matching scheduling's MVP).
- Self-service access requests, "view as" previews and "why can't I" explanations (see Approach B, parked).
- Enforcing a second factor on staff Google accounts (the company cannot; see §10).

## 6. Competitive analysis
| # | Product · URL | Features | Value per feature (1-5) | Gap |
|---|---|---|---|---|
| 1 | Clerk · [docs](https://clerk.com/docs/guides/organizations/roles-and-permissions) | Custom roles; Google sign-in; admin API | 3 · 4 · 2 | Custom roles paid, 10-role cap; not per-feature permissions |
| 2 | WorkOS AuthKit + RBAC · [docs](https://workos.com/docs/rbac) | Org-scoped custom roles; free user management | 3 · 3 | Roles live in a vendor dashboard, not our admin UI; built for selling to business customers |
| 3 | Cloudflare Access · [product](https://www.cloudflare.com/zero-trust/products/access/) | Google as login; entry policies; free up to 50 users | 4 · 3 · 4 | Only lets people in or not; no per-feature permissions or admin-composed roles |
| 4 | Permit.io · [pricing](https://www.permit.io/pricing) | No-code role editor; free tier | 4 · 4 | Closest match, but no sign-in or user list; another outside service |
| 5 | Simpplr (intranet) · [help](https://help.simpplr.com/hc/en-us/articles/5685409940115) | Built-in + custom admin roles; audience visibility | 3 · 3 | Roles built only from Simpplr's own fixed permissions; enterprise pricing |
| 6 | Notion · [pricing](https://www.notion.com/pricing) | Fixed owner/member/guest roles | 2 | No admin-composed roles below Enterprise; no hook for our own permissions |
| 7 | Build in-house | Domain-checked Google sign-in; access list; roles from feature permissions | 5 | Fits every interview fact; build and security effort is ours |

Footnotes: researched 2026-10-31 from search summaries (pages not opened; prices unverified). Queries: (1) "Clerk pricing organizations custom roles permissions"; (2) "WorkOS RBAC custom roles permissions pricing"; (3) "Cloudflare Access pricing free 50 users Google login allowlist"; (4) "Permit.io pricing free tier RBAC policy editor"; (5) "Simpplr intranet admin roles permissions"; (6) "Notion custom roles permissions pricing"; (7) interview.

**Main gap:** no product combines sign-in limited to an admin-kept list of company-domain Google accounts with roles composed from permissions our own features declare.

## 7. Strategic approaches

### Approach A — Allowlist Sign-in, Admin-Composed Roles
- **Thesis:** Staff on the company domain sign in with Google only if an admin has put them on the access list; each feature declares its permissions, admins bundle them into access roles on one plain admin page, and every request re-checks that the user is still on the list.
- **For whom:** admins and feature teams, starting with resource scheduling.
- **Outcome metric:** features checking access through the shared permission check: 0 → 100%; scheduling ships its 6 permissions with no custom access code.
- **Key trade-off:** minimal admin screens; no audit, self-service or team scope; leaver cleanup depends on admins acting.
- **Effort signal:** S
- **Recommended?** ●

### Approach B — Explainable, Self-Auditing Access
- **Thesis:** Features declare permissions once, and admins get a console that explains why anyone can or can't do something, previews a role change "as" a person before it goes live, flags drift (unused roles, over-broad grants, dormant users) and cuts a leaver off in one step.
- **For whom:** admins who must be sure nobody, leavers included, sees what they shouldn't.
- **Outcome metric:** time from marking a leaver to losing all access: unbounded → ≤5 minutes, with 0 live leaver sessions.
- **Key trade-off:** about twice the build time of plain role assignment, delaying scheduling.
- **Effort signal:** L
- **Recommended?** ◯

### Approach C — Admin-Curated Roles, Feature-Published Catalogue
- **Thesis:** Same sign-in rule as A, but features publish permissions into a shared catalogue that admins compose from, and removal of a user or role takes effect within five minutes.
- **For whom:** admins and feature teams.
- **Outcome metric:** removal-to-denial time: no control → ≤5 minutes; features with their own access logic → 0.
- **Key trade-off:** a catalogue that must stay in sync and a short revocation delay, for roughly the same business outcome as A.
- **Effort signal:** M
- **Recommended?** ◯

## 8. Multi-perspective feedback

### Engineer
- A has the smallest surface: an identity check, a list lookup and role-to-permission resolution; at ~30 users a per-request check is negligible.
- The server must require both a verified email and an exact domain match; these are not company-managed accounts, so a weak check breaks the whole model.
- Renamed or removed permissions must be reconciled with stored role grants, or roles silently over- or under-grant (A and C).
- First-admin bootstrap is unaddressed and is a lockout risk in all three.

### Executive
- A unblocks scheduling soonest at the lowest cost, and meets all three success criteria.
- B doubles the cost for tooling a 30-person company with 1–2 admins barely needs.
- C delivers about the same business outcome as A at a higher cost; the difference is how it's built, not what it delivers.

### UX-researcher
- A domain-valid person who isn't on the access list yet must see a clear "ask an admin" screen, or the first day reads as broken.
- Admins in A and C pick permissions by name; plain labels and descriptions decide whether roles are composed correctly.

### Synthesis matrix
|         | Engineer | Executive | UX |
|---------|:--------:|:---------:|:--:|
| App. A  | + smallest surface, cheap per-request check | + unblocks scheduling soonest, cheapest | 0 simple, but admins work blind |
| App. B  | − impersonation, usage tracking, extra state | − twice the cost, delays scheduling | + explainable, previewable, confidence-building |
| App. C  | 0 catalogue sync adds moving parts | 0 same outcome, costs more | 0 revocation lag confuses admins |

## 9. Trade-offs and edge cases

### Trade-offs per approach
| Approach | Pros | Cons |
|---|---|---|
| A | Fastest; smallest surface; removal effective on the next request | Admins can't preview or explain access; no history |
| B | Admin confidence; one-step leaver cut-off; drift visibility | ~2× effort; usage tracking contradicts "no audit in v1"; delays scheduling |
| C | Explicit catalogue contract; composable roles | Sync and delay add complexity; little extra business value over A |

### Edge cases
- A domain-valid person not yet on the access list signs in: a clear refusal with whom to contact.
- Email mismatch between the access list and Google (case, alias, typo, or an unverified email on the Google account).
- The only admin removes their own admin role, or leaves: the last admin must be protected.
- First deploy with an empty access list: the first admin comes from configuration, not a default account.
- A feature renames, splits or removes a permission: affected roles are flagged to the admin and grant nothing silently.
- A feature forgets to declare a permission, or checks only in the page: the shared check must be the only way in, and undeclared checks fail closed.
- A user is removed mid-session: their next action is refused.
- A role bundles "see leave reasons" too broadly: admins see each role's permissions in plain words before assigning it.

## 10. Risks
- **Top (devil's advocate): a leaver keeps a working key.** Staff Google accounts can't be disabled by the company, so the access list is the only gate. If an admin forgets, access never ends; if the leaver's mailbox is reassigned, the new holder could reset the Google password and sign in with the leaver's roles. With no audit log there is no signal. Mitigation: offboarding removes the user from the access list as a checklist step; a mailbox is never reassigned before that; listing users by last sign-in is a cheap later add-on.
- **Phished personal accounts:** no enforceable second factor; one stolen password grants that user's roles. Accepted for v1.
- **Other:** leave reasons over-granted via catch-all roles; future features failing open; admin lockout (§9).

## 11. RICE — Claude proposed
- **Reach (R)**: 30 — all staff sign in every visit (§3).
- **Impact (I)**: 3 — nothing in the intranet works without it and scheduling is blocked on it (§2; Executive, §8).
- **Confidence (C)**: 0.8 — facts are concrete, with five open questions left (§15).
- **Effort (E)**: 3 person-weeks — Approach A's S signal (§7) plus the bootstrap, permission-reconciliation and refusal-screen hardening (§8, §9).
- **RICE = 30 × 3 × 0.8 / 3 = 24** (C: 18 at 4 weeks; B: 8 at 9 weeks)
- **State**: confirmed

## 12. Feasibility — Claude proposed

- [☑] **Tech**: the request-actor seam (`Actor`/`CurrentActor` in the kernel) and the authenticate step already exist as stubs, and scheduling's ADR-0004 already designs per-request permission resolution.
- [☑] **Skills**: no sign-in has shipped in this repo yet (no feature has shipped; first commit 2026-10-08), but the team has built Google sign-in and roles on client projects.
- [☑] **Time**: no hard deadline; about 3 person-weeks, sequenced before scheduling's launch. No adjacent feature in the repo to compare against.
- **State**: confirmed

## 13. Recommendation
**Selected: Approach A — Allowlist Sign-in, Admin-Composed Roles**, with three hardening items: the first admin comes from configuration and the last admin can't lose admin rights; renamed or removed permissions are flagged to admins and grant nothing; a person not on the access list sees a clear "ask an admin" screen.

A has the best value for cost, with RICE 24 against C's 18 and B's 8 (§11), and Feasibility is 3/3 ☑ (§12). It is the only approach both Engineer and Executive rated "+" ("smallest surface, cheap per-request check"; "unblocks scheduling soonest, cheapest", §8). It covers the main market gap: no product ties a sign-in limited to an admin-kept list to roles composed from our own features' permissions (§6). Because the access list is re-checked on every request, removal takes effect on the next action. That resolves the tension between the "a few minutes is fine" tolerance and scheduling's AC-14.

**Locked-in pointer**: the PRD must specify Google sign-in restricted to the company domain with a verified email, an admin-kept access list, per-feature declared permissions, admin-composed access roles (one or more per user), a per-request check, the three hardening items, and the six scheduling permissions as the first catalogue entries.

## 14. Parked & rejected approaches
| # | Approach | Status | Reason | Revisit trigger |
|---|---|:---:|---|---|
| B | Explainable, Self-Auditing Access | parked | ~2× effort, delays scheduling, and implies the audit trail v1 excludes | Admins report "why does X have access?" questions monthly, or an access incident needs investigating |
| C | Admin-Curated Roles, Feature-Published Catalogue | parked | Same business outcome as A at higher cost; its five-minute delay is weaker than A's per-request check | More than ~10 features declare permissions and admins can't find them in A's plain list |
| - | Buy a hosted identity/authorization service | rejected | Each covers only half the need; adds a vendor and cost for 30 users (§6) | Contractors or clients need access |

## 15. Open questions
- [ ] Can a user hold more than one access role? (Assumed yes; confirm in PRD.) — owner: dmitro.b, due: PRD
- [ ] Offboarding: who removes leavers from the access list, and is mailbox reassignment blocked until then? — owner: dmitro.b, due: PRD
- [ ] Which plain-language labels and descriptions do the six scheduling permissions get on the admin page? — owner: PM + scheduling owner, due: PRD
- [ ] Is there a default access role for newly added users (e.g. "see own schedule"), or do they start with none? — owner: dmitro.b, due: PRD
- [ ] Repo ADR 0001's open authentication-source decision is settled by this brief (Google sign-in). Record it as an ADR at architecture-design (gate 3, not here). — owner: Tech Lead, due: SAD

## Related
- [`CONTEXT.md`](../../../CONTEXT.md) — glossary (user, admin, access list, access role, permission)
- [resource-scheduling PRD](../resource-scheduling/PRD.md) — first consumer, six permissions, AC-14
- [resource-scheduling ADR-0004](../resource-scheduling/adr/0004-resolve-permissions-into-actor-per-request.md) — per-request permission resolution
- [Repo ADR 0001](../../adr/0001-modular-monolith.md) — authentication source left open

## DoD self-check
- [x] 15 sections present
- [x] No anti-pattern terms (Postgres/Redis/etc.)
- [x] Length ≤ 5 pages (~2200 words)
- [x] Frontmatter status: Confirmed
- [x] RICE confirmed (state: confirmed)
- [x] Feasibility confirmed (state: confirmed)
- [x] Recommendation present with rationale citing 4 upstream sections (§6, §8, §11, §12)
