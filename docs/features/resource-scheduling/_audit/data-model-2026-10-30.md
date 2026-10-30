# Audit — generate-data-model — resource-scheduling — 2026-10-30

Mode: greenfield (no `org` / `projects` / `scheduling` tables exist yet). Size: M (from PRD frontmatter `feature_size`; no `.size` file).

## Generated files

- `docs/features/resource-scheduling/data-model.md`
- Staged migrations, `docs/features/resource-scheduling/migrations/`:
  - `20261030120000_create_teams_and_employee_records.{up,down}.sql`
  - `20261030120001_create_public_holidays.{up,down}.sql`
  - `20261030120002_create_projects.{up,down}.sql`
  - `20261030120003_create_allocations.{up,down}.sql`
  - `20261030120004_create_allocation_history.{up,down}.sql`
  - `20261030120005_create_import_runs.{up,down}.sql`
- `.claude/rules/backend/db.md`: the course baseline's rules that do not conflict with the repo were merged in (sections «Table design» and «Changing existing tables»). The bootstrapped `.claude/rules/migrations.md` was deleted: its filename, `.up`/`.down`, `IF NOT EXISTS` and `CONCURRENTLY` rules contradict the drizzle-kit workflow.

**The migrations are staged and are not yet in the live `packages/migrations/drizzle/` tree.** `implement-tasks` promotes them, re-stamping at promote time. In this repo, promotion means writing the module `schema.ts` files and running `pnpm db:generate` (see Convention divergences).

**Verified:** all six `.up.sql` files were applied in order to a scratch database (`arv_dm_check`) on the local Postgres 18 container, then applied **again** with no error (idempotent). Both one-time guards were exercised. A second `import_runs` row was rejected, and so was a second team named `'platform '` next to `'Platform'`. All `.down.sql` files were then applied in reverse, leaving 0 of the `org` / `projects` / `scheduling` schemas. The scratch database was dropped afterwards.

## Self-check (4/4 pass)

| Check | Result |
|---|---|
| Naming | Plural snake_case tables. All filenames match `<14-digit timestamp>_create_<entity>.(up\|down).sql`. |
| down.sql reversibility | Every CREATE SCHEMA / TABLE / INDEX / ADD CONSTRAINT has a matching DROP, proven by the scratch-DB round trip. `org` and `scheduling` schemas are dropped by the down of their first file. |
| FK indexes | `employee_records.team_id` → `idx_employee_records_team_id`. `teams.team_lead_id` → `idx_teams_team_lead_id`. `allocation_segments.allocation_id` → `idx_allocation_segments_allocation_id`. |
| Forbidden features | `grep -nE "CHECK *\(\|CREATE TRIGGER\|DEFAULT '"` gives no hits. The only defaults are `now()` and `uuidv7()` (PK, see divergences). |
| Mermaid | `mmdc` was not available, and running it through `npx` was blocked. The structural lint per `_shared/mermaid-check.md` passes (valid cardinality glyphs, `type name [PK\|FK\|UK] "comment"` lines, no placeholders). **Render-check once in a Markdown preview.** |

## Convention divergences

1. **PK generation.** The course default is app-side UUID v7. Per the user's decision on 2026-10-30, the repo convention `UUID PRIMARY KEY DEFAULT uuidv7()` was used instead, matching `identity.users`, SAD §8 and `.claude/rules/backend/db.md`.
2. **Migration tooling.** The repo's migrations are **drizzle-kit generated** from `modules/*/src/infrastructure/schema.ts`, with **sequential** names (`0000_…`, `0001_…`) and **no down files**. The staged files follow the course (hand-written SQL, timestamp names, `.up`/`.down` pairs, `IF NOT EXISTS`). At promote time the staged `.up.sql` is the **spec**: `schema.ts` must make `pnpm db:generate` produce equivalent SQL (diff them). The staged `.down.sql` is the reviewed manual rollback. drizzle-kit does not emit `IF NOT EXISTS`, so idempotency holds for the staged files only. Watch the promote-time diff for these points:
   - The `teams` ↔ `employee_records` FK cycle. drizzle-kit emits FKs as separate `ALTER TABLE`s, so this is fine.
   - Expression indexes `lower(btrim(name))` and `((true))`.
   - `smallint[]`.
3. **String types.** `identity.users` uses `text`. This feature uses `VARCHAR(N)` per the course default. Bounds (100 team / holiday name, 200 person / project name, 16 / 8 enum codes) are architect's choices because the PRD gives no maximum lengths (see TBDs).
4. **Audit columns.** `created_at` is on every table. `last_changed_by` / `last_changed_at` / `version` are added **only** to `allocations` (PRD AC-07, AC-07b) and `employee_records` (SAD §8 optimistic version, flow 9 conflict shows who changed it). They are surfaced in `data-model.md` and were not added silently. There is no `updated_at` anywhere.
5. **Test fixtures PII.** The existing `makeUser` in `packages/db/src/testing/seed.ts` generates `user<n>@arvest.digital`, a real company domain, which breaks the course PII guard. The new fixtures specified in `data-model.md` use `example.test`. Changing `makeUser` is out of this feature's scope, so the team should decide.

## Drift findings

**Schema vs source.** Skipped. The `org`, `projects` and `scheduling` modules (domain layer, `schema.ts`) do not exist yet, so nothing went into `_drift/`.

**Model vs spec** (PRD §4/§5 + SAD §5/§6):

| Spec entity / relationship | Table | Status |
|---|---|---|
| Employee record, login link (US-07, AC-19b) | `org.employee_records` (`user_id` UNIQUE) | ✓ |
| Team + team lead (AC-19d) | `org.teams` | ✓ |
| Public holiday (US-09) | `org.public_holidays` | ✓ |
| Project, 5 types, close date (US-08, AC-25) | `projects.projects` | ✓ |
| Allocation, effective-dated (US-03, ADR-0008) | `scheduling.allocations` + `allocation_segments` | ✓ |
| Leave (US-04) | allocation to a `leave`-type project, `rate_period = 'full-day'` | ✓ (no own table, per SAD) |
| Allocation history, 12 months (US-05, AC-16) | `scheduling.allocation_history` | ✓ |
| One-time import (US-11, AC-32) | `scheduling.import_runs` | ✓ |
| User / login | `identity.users` (existing) | ✓ referenced by ID |
| Permissions, access roles | none | Out of scope (separate roles/permissions feature, ADR-0004) |
| Capacity, availability, overbooking, needing attention, incomplete record | none | Computed on read (ADR-0005), so no table is intended |

- SAD §5 lists exactly these 8 tables per module, so there are no orphan tables and no missing ones.
- **SAD has no §6.4 ER stub.** Relationships were derived from SAD §5 + ADR-0008 + the flows.
- Consider adding a pointer from SAD §5 to `data-model.md` on the next SAD edit.

**Spec gaps found while modelling (not drift, but decisions the SAD left implicit):**
- **Leave hours.** The PRD says a leave day «takes the resource's full daily capacity». It is modelled as `rate_period = 'full-day'` with `rate_minutes` NULL, so leave follows later contract changes. If leave should instead freeze the hours at booking time, store `rate_minutes` and use `day`.
- **Full removal.** «Remove» of an allocation that starts today or later deletes the row (hard delete), and its history survives because `allocation_history.allocation_id` has no FK. Removing one already under way only ends its last segment yesterday (AC-09b).
- **Allocation fields fixed at creation.** `employee_id` and `project_id` are treated as immutable on an allocation. Moving work to another project or resource means removing it and creating a new one. The PRD does not say otherwise.

## Breaking changes decomposed

None (greenfield, additive only, matching SAD §7 «migrations are additive only»).

## TBDs

| Where | TBD |
|---|---|
| `data-model.md` § `org.teams`, `name` row | Max length 100 is an architect's bound, PRD gives none |
| `data-model.md` § `org.teams`, `team_lead_id` row | Whether the import creates teams without a lead depends on the spreadsheet format (PRD §8) |
| `data-model.md` § `org.employee_records`, `full_name` row | Bound 200 is an architect's choice |
| `data-model.md` § `org.public_holidays`, `name` row | PRD names no holiday label; drop it if the UI does not show one |

## Open questions closed in this pass

- **SAD §11 / PRD §8:** «do changes to contract hours or working days need an effective date?» **No.** A change applies to all weeks (PRD default, confirmed 2026-10-30). The PRD §8 checkbox and the SAD §11 row can be closed on the next edit of those documents.
