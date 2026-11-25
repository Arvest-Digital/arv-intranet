# Audit — generate-data-model — schedule-daily-view — 2026-11-22

Mode: **brownfield delta.** The tables exist (resource-scheduling, live migrations `0003_org_schema` and `0005_scheduling_schema`). Size: L (PRD frontmatter). Stages 1–2 store nothing new. Stage 3 alters two tables and creates none.

## Generated files

- `docs/features/schedule-daily-view/data-model.md`
- Staged migrations, `docs/features/schedule-daily-view/migrations/`:
  - `20261122120000_alter_allocation_segments_time_interval.{up,down}.sql`
  - `20261122120001_alter_employee_records_working_day_start.{up,down}.sql`
- `docs/features/schedule-daily-view/sad.md`: §2 override, §4 choice 3, §5 tree and §7 bullets now match the two decisions below. These are wording changes only; no structure changed.
- `.claude/rules/migrations.md` was **not** bootstrapped. Per the 2026-10-30 decision, `.claude/rules/backend/db.md` is the repo's DB rulebook.

**The migrations are staged and are not yet in the live `packages/migrations/drizzle/` tree.** `implement-tasks` promotes them by changing both `schema.ts` files, running `pnpm db:generate` (one `0006_*` for both modules) and hand-adding the guard and the backfill/drop-default pair to the generated SQL. The exact recipe is in data-model.md under «Migrations (staged)».

**Verified on a scratch database** (`arv_dm_check3/4`, local Postgres 18 container, live `0000`–`0005` applied first, dropped afterwards):
- The up file with a `day` work segment present **aborts** with the guard message.
- After the work allocation was deleted, both up files ran **twice** with no error (idempotent).
- Afterwards: `starts_at_minute`/`ends_at_minute` exist, the rate columns are gone, the existing employee record holds `540`, the column is NOT NULL with **no default**, and an insert without it fails.
- Both down files ran twice in reverse with no error. The interval 540–780 came back as `day`/240, and leave as `full-day`/NULL.
- Runbook SQL: step 0 listed the work segment. Step 1 kept only the leave allocation and its history (the orphan «removed» entry was deleted). Both QG-4 counts were 0.

## Decisions taken in this pass (author)

1. `rate_period` is dropped; leave = NULL interval (AskUserQuestion, recommended option).
2. `working_day_start_minute` is added in one step with a one-shot `DEFAULT 540` that the same migration drops. This **extends the SAD §2 pre-production override to `org`** (AskUserQuestion, recommended option). Residual risk: between `db:migrate` and the `arv-api` deploy (§7 steps 2→3), old api code can't create an employee record (NOT NULL, no default). The window is minutes, and ~5 editors are affected.

## Self-check (4/4 pass)

| Check | Result |
|---|---|
| Naming | Tables are unchanged (plural snake_case). Files follow `<14-digit timestamp>_alter_<entity>_<what>.(up\|down).sql`. Columns are snake_case with a `_minute` unit suffix, matching `contract_minutes`. |
| down.sql reversibility | Every ADD COLUMN has a DROP COLUMN, and every DROP COLUMN has a re-ADD (with a data mapping back). Proven by the round trip above. |
| FK indexes | No new FK. The existing `allocation_segments.allocation_id` keeps `idx_allocation_segments_allocation_id`. |
| Forbidden features | `grep -nE "CHECK *\(\|CREATE TRIGGER\|DEFAULT '"`: no hits. **One deliberate exception, surfaced:** `DEFAULT 540` in `…120001.up.sql:12` is a backfill device, dropped by the next statement (`:13`), so no business default stays on the table. The `DO $$` blocks are one-shot guards and backfills, not stored procedures or triggers. |
| Mermaid | `mmdc` is not installed. The structural lint per `_shared/mermaid-check.md` passes: valid cardinality glyphs (`\|\|--\|{`, `\|\|..o{`), `type name [PK\|FK] "comment"` attribute lines, no placeholders, and `smallint_array` written as one token, as in the resource-scheduling model. **Render-check once in a Markdown preview.** |

## Convention divergences

1. **Migration tooling** (same as resource-scheduling): the repo uses drizzle-kit generated, sequential `NNNN_*.sql` files with no down files. The staged files follow the course (timestamped, `.up`/`.down`, `IF [NOT] EXISTS`). At promote time the `.up.sql` is the spec for the generated SQL, and the `.down.sql` is documentation only: `db.md` rolls back with a new forward migration.
2. **Hand edits to generated SQL are required.** drizzle-kit emits neither the guard nor the backfill default. Both must be added to `0006_*.sql` before it is applied anywhere. The final schema state matches the snapshot, so `pnpm db:generate` reports no changes afterwards.
3. **Non-additive change on a table with data** (drop the rate columns; NOT NULL on `employee_records`). `db.md` normally requires expand → backfill → contract. This is covered by the SAD §2 override, now extended to org, and is valid only while ADR-0003's precondition holds.
4. **No `CREATE INDEX CONCURRENTLY`**: not needed (no new index), and impossible anyway under drizzle-kit's one-transaction migrate.
5. **PK default.** Unchanged `DEFAULT uuidv7()` (repo convention, accepted 2026-10-30 instead of the course's app-side v7).
6. **Integer, not VARCHAR/time**, for times of day: ADR-0002 option 1.

## Drift findings

### Schema vs source

- **Today (before stage 3):** `modules/scheduling/src/infrastructure/schema.ts` and the domain agree. `Segment`/`RatePeriod` in `domain/allocation.ts` and `domain/capacity.ts` map 1:1 onto `rate_minutes`/`rate_period` via `drizzle-allocation-repository.ts` (`toSegment`, `segmentKey`). The org `employee_records` columns match the live schema. **No `_drift/*.sql` proposed.**
- **After the staged change (expected, implementation work for stage 3):** the code lags the design. It is listed here so `break-tasks` doesn't miss it:
  - `scheduling`: the `RatePeriod`/`Rate` types, `rateRules` (AC-09 hour rules → AC-24 interval rules), `minutesOnDay` in `capacity.ts`, `toSegment`/`segmentKey` in the repository, the import row parser and the CSV format (PRD §8 default), contracts `scheduling/writes.ts`, and the presenter.
  - `org`: `EmployeeRecord.workingDayStart` plus validation (AC-27b), the repository mapping, the `OrgApi` employment terms, and the contracts `org` DTOs.
  - `@arv/db/testing`: `seed-scheduling.ts` (segment INSERT) and `seed-org.ts` (now must supply `working_day_start_minute`, because the column has no default).
  - `apps/api/test/integration/scheduling/import.test.ts:245` selects the rate columns.
- **History snapshot decoder** (`drizzle-history-repository.ts:15-17`, `Schema.decodeUnknownSync`). Surviving leave history keeps the legacy shape `{rateMinutes: null, ratePeriod: 'full-day'}`. If the new `Segment` schema rejects it, reading that history is a **defect (500)**. Required: the decoder accepts the legacy leave shape (data-model.md «History snapshots»). Runbook step 1 deletes all other history.

### Model vs spec

| Spec item | Table / column | Status |
|---|---|---|
| PRD AC-23/AC-24 daily time interval, 15-min steps, ≤ 24 h | `allocation_segments.starts_at_minute`/`ends_at_minute` | ✓ (invariants in domain) |
| PRD AC-23 «interval change on a started allocation applies from today» | effective-dated segments (existing) | ✓ no schema change |
| PRD §1 stage 3 «weekly rate removed» | `rate_minutes`, `rate_period` dropped | ✓ |
| PRD AC-27/AC-27b working-day start, default 09:00, end computed | `employee_records.working_day_start_minute` | ✓ default in domain, not DB |
| PRD AC-28 conversion of existing allocations, NFR «Migration correctness» | — | **Not modelled, by design**: SAD §1 decision override + ADR-0003. Replaced by the guard plus the QG-4 count check. |
| PRD AC-25 time overlap, AC-21 timeline, AC-26 outside working hours | — | computed on read, nothing stored ✓ |
| SAD §4 «default 540» | — | **Reworded** in sad.md to match decision 2 |
| SAD §7 «leave keeps `full-day`» (rate period) | — | **Reworded** in sad.md to match decision 1. ADR-0002's «leave keeps a full-day kind» still holds as a domain kind; the Accepted ADR is not edited. |
| SAD §6.4 ER stub | — | **Absent**: the SAD has no §6.4. ER is drawn here from SAD §5 and the base resource-scheduling model. |
| Tables with no PRD/SAD origin | — | none |

## Breaking changes decomposed

None into 3 steps. The rate drop and the NOT NULL add are deliberately **one step** under the pre-production override (decisions 1–2, ADR-0003). If the ADR-0003 precondition breaks (real allocations in production before stage 3), fall back to ADR-0003 option 2:
- expand: add the interval columns plus `working_day_start_minute` nullable;
- convert with a use case through `OrgApi`;
- contract: drop the rate and set NOT NULL.

Each would be a separate migration and deploy.

## TBDs

No `<!-- TBD -->` in data-model.md. Open items that touch persistence, inherited from PRD §8 and not decided here:
- Import format after the rate is removed (PRD §8, owner PM + Tech Lead): this affects `import-rows.ts`, not the schema.
- Timeline block dragging (PRD §8): no schema impact either way.
