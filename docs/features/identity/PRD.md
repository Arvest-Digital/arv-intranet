---
status: Draft
owner: "dmitro.b"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-31"
feature_size: "M"
stage: "03"
ticket: "TBD"
---

# PRD — identity

> **Inputs (required):** [idea-brief](./idea-brief.md) · [CONTEXT](../../../CONTEXT.md) (repo-root glossary; this repo is single-context)
> **Reference module:** N/A — green-field mode (the existing identity module is an unshipped scaffold; not used as a reference).
> **External context channels used:** None — only CONTEXT + idea-brief.

Domain terms (**user**, **admin**, **access list**, **access role**, **permission**, **retired permission**, **resource**, **leave**) follow [`CONTEXT.md`](../../../CONTEXT.md).

## 1. Context

The intranet has no sign-in, so every request is treated as anonymous and nobody can be granted a permission. All ~30 staff are affected on every visit, because nothing else in the intranet works until they are signed in; the 1–2 admins act at onboarding, offboarding and role changes, a few times a month. Without one shared access model each feature would invent its own rules, and sensitive data such as leave reasons would depend on each feature remembering to protect it.

This is strategic, not incident-driven. Resource scheduling is ready to build but its launch is explicitly blocked until a real permission source exists, and every later intranet feature (people, leave, projects) needs the same foundation. There is no hard deadline.

The company has exactly one email domain, set in the intranet's configuration, and every staff member has a Google account managed by the company's own Google organisation on that domain.

We commit to **Allowlist Sign-in, Admin-Composed Roles** (idea-brief §13, Approach A): staff on the company email domain sign in with their company-managed Google account only if an admin has put them on the access list; each feature declares its permissions; admins bundle permissions into access roles and give each user zero or more (several allowed); and every request re-checks that the user is still on the access list and what their access roles currently grant. Three hardening items come with it: the first admin is seeded from configuration and the last admin cannot lose admin rights; retired permissions are flagged to admins and grant nothing; a person not on the access list sees a clear «ask an admin» screen. The six resource-scheduling permissions are the first feature-declared entries, next to identity's own manage-access permission.

Traceability:
- Raw idea (baseline, verbatim from idea-brief §1): «We don't yet have authorization and authentication, or a roles and permissions system, in the project. This is an important part of the product, and all future features will depend on it.»
- Committed baseline for this PRD (chosen at write-prd step 2): idea-brief §13 Recommendation, quoted in ¶3 above.
- Critic findings (2026-10-31) resolved by amendment: no overrides.
- Interview decisions (2026-10-31, medium depth): a user may hold several access roles and gets the union of their permissions; an admin may mark one access role to be pre-selected when adding someone (an ordinary assignment afterwards); leavers are removed from the access list by an admin on their last working day and their mailbox is not reassigned before that; sessions last at most 7 days; the configured first admin takes effect only while no user holds manage access, never as a bypass while an admin exists; user stories use only the glossary roles user and admin (feature teams' needs are expressed through goals, US-08 and the cross-context criteria); the plain-language permission labels stay an open question (§8).
- Clarify-prd decisions (2026-10-31, medium depth): only company-managed Google accounts sign in; one company email domain from configuration; the configured address becomes admin whenever no user holds manage access (role «Admin», name from Google); the last-admin guard covers any single action that would leave zero admins; removing a user ends their sessions; sign-out ends that session fully, other devices stay signed in; only successful sign-ins are logged; the «not set up yet» screen names admins with name and email; refusal on every request when access cannot be determined; admins can edit a user's name but not their address; deleting the pre-selected role clears the mark; a re-declared permission grants again on the roles that still hold it; after sign-in the user returns to the page they first asked for.

## 2. Goals

- Only people an admin has put on the access list, signing in with a verified company-domain Google account, can use the intranet, and removing someone ends their access on their next action.
- Admins decide who may do what by composing access roles from the permissions features declare, without developer help, and no ordinary, one-at-a-time action can leave the intranet without an admin (AC-14; recovery for the remaining cases in §8 Q4).
- Every intranet feature, starting with resource scheduling, checks access through one shared permission check that refuses anything not granted, so no feature builds its own access control.

## 3. Non-goals

- **Contractors, clients or anyone outside the company domain** — the access list holds company-domain addresses only; outside access needs a different trust model (idea-brief §5, §14 revisit trigger).
- **Changing a user's email address** — a new address is a different Google account, so it is handled by removing the user and adding the new address; only the name can be edited (US-03, AC-21).
- **Personal Google accounts registered on a company address** — only accounts managed by the company's Google organisation can sign in (AC-02).
- **Own passwords, password reset or a second sign-in method** — the company Google account is the only identity source; a second one doubles what must be secured for ~30 people.
- **An audit log of who granted or removed access** — v1 keeps current state only; revisit if an access incident needs investigating (idea-brief §14, Approach B).
- **Permissions limited to a team or project** — all permissions are company-wide, matching resource scheduling's MVP.
- **Self-service access requests, «view as» previews and «why can't I» explanations** — parked with Approach B: about twice the effort and it would delay scheduling.
- **Enforcing a second factor on staff Google accounts** — the company cannot control these accounts; the phishing risk is accepted for v1 (idea-brief §10).

## 4. User stories

### US-01: Sign in with company Google
**As a** user
**I want** to sign in with my company-domain Google account
**So that** I reach the intranet without a separate password

### US-02: Tell outsiders whom to ask
**As an** admin
**I want** a person with a company Google account who is not on the access list to be told they are not set up yet and which admins can add them
**So that** a newcomer's first day doesn't read as «the intranet is broken» and they come straight to the right person

### US-03: Keep the access list
**As an** admin
**I want** to add company-domain addresses to the access list, correct a user's name, and remove them
**So that** only current staff can use the intranet, names stay right without losing anyone's access roles, and a leaver loses access the moment I remove them

### US-04: Compose access roles
**As an** admin
**I want** to create, rename, change and delete access roles by picking permissions, each shown with a plain-language name, a one-sentence description and the feature it belongs to
**So that** each role grants exactly what I intend and «see leave reasons» doesn't slip into a catch-all role

### US-05: Assign access roles
**As an** admin
**I want** to give each user zero or more access roles, see the combined permissions those roles grant them in plain words, and mark at most one role to be pre-selected when I add someone new
**So that** onboarding takes one step and I can tell at a glance what a person may do

### US-06: Never lose the last admin
**As an** admin
**I want** the system to stop the last admin losing admin rights, and the very first admin to come from configuration when there is no admin yet
**So that** no ordinary, one-at-a-time action can leave the intranet with nobody able to manage access (AC-14; recovery for the remaining cases in §8 Q4)

### US-07: Spot retired permissions
**As an** admin
**I want** access roles that still grant a retired permission to be flagged, naming that permission
**So that** I can fix those roles and nobody is silently over- or under-granted

### US-08: Act with my current access
**As a** user
**I want** every intranet feature to check my current permissions through one shared check at the moment of each action
**So that** what I may do changes as soon as an admin changes my access, and no feature lets me do something nobody granted

### US-09: Sign out
**As a** user
**I want** to sign out, and to be asked to sign in again after 7 days
**So that** nobody who uses this browser after me acts as me

## 5. Acceptance criteria

### AC-01 (US-01) — happy path
**Given** a person on the access list whose Google account is managed by the company's Google organisation, uses the company email domain and reports that email as verified
**When** the person chooses to sign in with Google, having first opened an intranet page (for example a link to the schedule board)
**Then** the person is signed in as that user, lands on the intranet page they first opened (or the intranet home page if they opened none, or a page outside the intranet was named), and stays signed in until they sign out or 7 days pass

### AC-02 (US-01) — error
**Given** a person whose Google account email is on a different domain, whose Google account does not report its email as verified, or whose Google account is not managed by the company's Google organisation (a personal account registered on a company address)
**When** the person tries to sign in
**Then** the system refuses, tells them that only verified company Google accounts can sign in, and records nothing about them, in the intranet's data or in production logs

### AC-03 (US-02) — authorization
**Given** a person with a verified company-domain Google account who is not on the access list
**When** the person tries to sign in or open any intranet page
**Then** the system refuses, tells them they are not on the intranet's access list yet, lists the name and company email address of every admin who can add them (or, if no admin exists, tells them to ask their manager), shows them no other intranet page or data, and records nothing about them

### AC-04 (US-03) — happy path
**Given** an admin and a new joiner who is not on the access list
**When** the admin adds the joiner's company-domain address and name, keeping or changing the access roles pre-selected in the form
**Then** the joiner appears on the access list with exactly the chosen access roles and can sign in from that moment

### AC-05 (US-03) — error
**Given** an admin
**When** the admin tries to add an address that is not on the company email domain, or is not a valid email address
**Then** the system refuses, tells the admin that only company-domain addresses can be added, and the access list stays unchanged

### AC-06 (US-03) — domain invariant
**Given** the address «anna@» on the company domain is already on the access list
**When** an admin adds «Anna@» on the company domain
**Then** the system refuses and tells the admin that this address is already on the access list, because each address appears once and letter case does not make a different address

### AC-07 (US-03) — happy path
**Given** a user who is signed in and in the middle of using the intranet
**When** an admin removes the user from the access list
**Then** the user's next action is refused and they are told they no longer have access; every session they had, on any device, ends, so if they are added again later they must sign in again; their access roles are removed with them, so if they are added again later they hold only the roles chosen at that time

### AC-08 (US-03) — authorization
**Given** a user who does not hold the manage-access permission
**When** the user tries to view or change the access list, the access roles or anyone's role assignments
**Then** the system refuses, tells the user they lack the permission to manage access, and shows them none of the access list, the access roles or who holds them

### AC-09 (US-04) — happy path
**Given** an admin choosing permissions for a new access role, where every permission is shown with a plain-language name, a one-sentence description and the feature it belongs to
**When** the admin creates the access role «Planner» with the view-the-whole-board and edit-allocations permissions
**Then** the access role is saved and listed with its permissions in plain words, and no user holds it until an admin assigns it

### AC-10 (US-04) — domain invariant
**Given** an access role named «Planner» exists
**When** an admin creates or renames another access role to «planner » (different letter case and a trailing space)
**Then** the system refuses and tells the admin that an access role with that name already exists, because access role names are unique regardless of letter case and surrounding spaces

### AC-11 (US-04) — happy path
**Given** five users hold the access role «Planner»
**When** an admin removes the edit-allocations permission from «Planner», or deletes «Planner» after the system warns that five users hold it and the admin confirms
**Then** from their next action those five users no longer have what «Planner» granted, unless another of their access roles grants it; if «Planner» was the role marked to be pre-selected for new people, the delete warning says so and afterwards no role is marked

### AC-12 (US-05) — happy path
**Given** a user who holds the access role «Planner» and an admin
**When** the admin also assigns the access role «People admin» to the user
**Then** the user holds both access roles, may do everything either grants, and the admin sees the user's combined permissions listed in plain words

### AC-13 (US-05) — happy path
**Given** an admin has marked the access role «Staff» to be pre-selected for new people
**When** the admin adds someone to the access list, and later marks «Planner» to be pre-selected instead or clears the mark
**Then** «Staff» is already ticked in the add form and can be unticked; at most one access role is marked at a time; and changing or clearing the mark changes no existing user's access roles

### AC-14 (US-06) — domain invariant
**Given** one or more users hold the manage-access permission — for example two admins who both get it from the single access role «Admin»
**When** an admin makes any one change after which no user would hold manage access: removing a user from the access list, taking an access role away from a user, removing manage access from an access role, or deleting an access role (here: deleting «Admin» or removing manage access from it)
**Then** the system refuses, tells the admin that the intranet must keep at least one admin and that another admin has to be appointed first, and nothing changes

### AC-15 (US-06) — happy path
**Given** no user holds the manage-access permission and the intranet's configuration names a company-domain address as the first admin
**When** the person with that address signs in with Google
**Then** they are put on the access list (or kept on it, with their existing access roles, if already there) under the name their Google account reports, and given the access role «Admin» — an ordinary access role holding only the manage-access permission, created if no access role with that name exists, otherwise reused with manage access added; once any admin exists, the configured address grants nothing beyond what the access list and access roles give it, and it takes effect again only if a later state leaves no user holding manage access

### AC-16 (US-07) — cross-context
**Given** the access role «Planner» grants edit allocations, and resource scheduling stops declaring the edit-allocations permission (renamed, split or removed)
**When** a holder of «Planner» tries to edit an allocation, and an admin opens the access roles
**Then** the holder is refused unless a permission scheduling still declares allows it; the admin sees «Planner» flagged as granting the retired permission, named, and can remove it from the role; and a retired permission cannot be added to any access role. If scheduling later declares edit allocations again under the same name, access roles that still list it grant it again and the flag disappears

### AC-17 (US-08) — cross-context
**Given** a user opened the schedule board while one of their access roles granted edit allocations
**When** an admin takes that permission away (from the role, or by removing the role from the user) and the user then saves an allocation change
**Then** resource scheduling refuses as if the user never had the permission, because permissions are checked at the moment of each action

### AC-18 (US-08) — authorization
**Given** an intranet feature action that requires a permission no feature has declared
**When** any user, an admin included, attempts that action
**Then** the system refuses, because a permission that is not declared is never granted to anyone

### AC-19 (US-08) — authorization
**Given** an admin whose access roles grant only the manage-access permission
**When** the admin tries to edit an allocation
**Then** the system refuses, because manage access lets an admin compose and assign access roles but grants no other permission by itself

### AC-20 (US-09) — happy path
**Given** a signed-in user
**When** the user signs out, or 7 days pass since they signed in
**Then** the next visit in that browser asks them to sign in again and shows no intranet page or data until they do; after sign-out that session cannot be used again from anywhere, even if it was copied; the user's sessions on other devices stay signed in; and the user stays signed in to Google itself

### AC-21 (US-03) — happy path
**Given** an admin and a user «Anna Kovalenko» who holds the access roles «Staff» and «Planner»
**When** the admin corrects the user's name to «Anna Koval»
**Then** the access list shows the new name, the user keeps both access roles and stays signed in, and the user's email address cannot be changed (a new address is removed and added as a new user)

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Latency p95 — sign-in completion (from Google's return to the first intranet page) | ≤ 800 ms | production server timing of the sign-in completion step |
| Latency p95 — access check added to every request (access list + permissions) | ≤ 25 ms | production request timing, access-check step vs total |
| Latency p95 — admin access actions (add/remove user, save access role, assign access role) | ≤ 500 ms | production request timing |
| Availability — sign-in and access check | ≥ 99.5% monthly, excluding Google outages | monthly uptime from production monitoring |
| Revocation | 0 requests accepted after a removal from the access list or a permission change is confirmed | integration test in CI |
| Session lifetime | ≤ 7 days from sign-in (absolute); 0 requests accepted on a session after its sign-out or after the user's removal from the access list | integration test in CI |
| Fail closed | 100% of intranet requests refused when the user's access-list membership or permissions cannot be determined | fault-injection test in CI |
| Capacity headroom | the three latency targets above hold at 100 users and 50 access roles | seeded load test in CI |

## 6.1 Security / privacy

- **Data classification:** confidential — this feature decides who can see confidential data such as leave reasons, so its own data and decisions are confidential too.
- **Personal data touched:** new — each user's company email address and name (entered by an admin, except the configured first admin's name, taken from their Google account — AC-15), their access-role assignments, and their active sign-in sessions. No passwords are handled or stored, no sign-in history or last-sign-in date is kept, and refused sign-in attempts record nothing about the person (AC-02, AC-03). Production logs keep successful sign-ins only, for at most 30 days, for operations and the launch sign-in KPI (§7); this is not an audit log and nothing is stored in the intranet's data.
- **AuthZ/AuthN impact:** introduces authentication for the whole intranet (a Google account managed by the company's Google organisation, with a verified company-domain email, plus the access list) and identity's own manage-access permission. Access is refused by default; permissions are checked at every action, never cached for a session; a permission no feature declares is never granted; manage access grants no other permission; the last admin is protected against ordinary, one-at-a-time actions (AC-14), with manual recovery for the remaining cases (§8 Q4).
- **Abuse cases:**
  - Someone with a personal or other-domain Google account, a personal Google account registered on a company address, or an unverified email, tries to sign in: refused with a generic message; nothing recorded (AC-02).
  - A company-domain person who is not on the access list learns the admins' names and email addresses from the «not set up yet» screen (AC-03): accepted — this is known inside a ~30-person company and is how a newcomer finds the right person.
  - A leaver keeps a working key, or their mailbox is reassigned and the new holder resets the Google password: the access list is the only gate — offboarding removes the user on their last working day and the mailbox is never reassigned before that (process rule; §8 Q2); removal takes effect on the next action (AC-07, NFR revocation).
  - A user tries to grant themselves access: refused and shown nothing of the access list or access roles (AC-08); an admin can grant themselves any access role — accepted, there are only 1–2 admins and no audit log in v1.
  - An admin (deliberately or by mistake) removes the last admin, alone or together with others in one change: refused (AC-14); two admins removing each other at exactly the same time is not guarded — accepted for 1–2 admins — and is recovered by the configured first admin signing in (AC-15), or manually if that person is unavailable (§8 Q4).
  - A stolen or shared device with an open session: the session ends within 7 days at most; an admin removing the user ends all their sessions (AC-07); signing out ends that session even if it was copied (AC-20).
  - A feature checks a misspelled or undeclared permission, or a feature renames one: refused for everyone (AC-18); roles granting the retired permission are flagged (AC-16).
- **Security review:** Required — new authentication boundary for the whole intranet, new personal data, size M.

## 7. Metrics / KPIs

- **Shared-check adoption** — share of intranet features that check access only through the shared permission check. Baseline: 0 (no feature shipped); target: 100% at resource scheduling's launch and for every later feature (checked per feature at review).
- **Scheduling unblocked** — resource scheduling's six permissions granted only through access roles, with no scheduling-specific access code. Baseline: scheduling launch blocked; target: 6 of 6 at scheduling's launch.
- **Staff sign-in coverage** — share of the ~30 staff who have signed in successfully at least once. Baseline: 0; target: ≥ 90% within 14 days of launch (distinct users counted from sign-in events in production logs).
- **Sign-in friction** — «can't get in» requests to admins caused by a missing or mismatched access-list entry. Baseline: none yet (no sign-in exists); target: ≤ 3 in the first 30 days after launch (admins keep a tally for those 30 days).
- **Leaver cut-off** — share of leavers removed from the access list on or before their last working day. Baseline: none yet (no access list exists); target: 100% from launch (checked monthly against the offboarding checklist).
- **Access-check overhead** — p95 latency the access check adds to each request. Baseline: 0 (no check exists); target: ≤ 25 ms, tracked after release (repeats §6).

## 8. Open questions

- [ ] What plain-language names and one-sentence descriptions do the seven launch permissions get (identity's manage access and scheduling's six)? Default now: the glossary wording. — owner: PM + scheduling owner, due: before `/sdlc:break-tasks identity`
- [ ] Who adds «remove from the access list on the last working day, and don't reassign the mailbox before that» to the company offboarding checklist? Default now: dmitro.b agrees it with HR. — owner: dmitro.b, due: before identity launch
- [ ] Record the authentication source (company Google sign-in, settled by idea-brief §13; repo ADR 0001 left it open) as an ADR? Default now: yes, at architecture-design. — owner: Tech Lead, due: `/sdlc:architecture-design identity`
- [ ] What is the recovery runbook if no admin is left and the configured first admin cannot sign in (they have left, or their address is no longer valid)? Default now: the Tech Lead updates the configured first-admin address to a current admin-to-be, who then signs in (AC-15); a direct fix in the data only as a last resort. — owner: Tech Lead, due: before identity launch
