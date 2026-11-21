# Briefs — schedule-daily-view

Ideas and follow-ups raised after the PRD was drafted. Each brief records the context, the decisions taken or still open and what a change touches, so the discussion can resume without re-deriving it. Same format as [resource-scheduling BRIEFS](../resource-scheduling/BRIEFS.md).

---

## B-01: One-day view by hour (time of day)

- **Status:** Adopted into this feature as **stage 3** (decided 2026-11-21 by the author; first parked the same day, then pulled into the current iteration)
- **Owner of the decision:** PM (product need), Tech Lead (data model and estimate)
- **Tracked in:** [PRD](./PRD.md) §1 (decision override), §3, US-08–US-10, AC-21–AC-30, §6, §6.1, §8; [idea-brief](./idea-brief.md) §13 «Scope change»
- **Origin:** question during the design hand-off: «is there a one-day view by hour?» The PRD stopped at one column per day; the author decided the time-of-day view is needed in the current iteration.

### Idea

A zoom below the day view: one day laid out on a time-of-day axis, showing what each resource works on and when within the day — allocation blocks with a start and end time, not only hours per day.

### Why it is not a small change

- **Data model:** allocations stored only dates and a rate (`allocation_segments`: `starts_on`, `ends_on`, `rate_minutes`, `rate_period` — [data-model](../resource-scheduling/data-model.md)). Time of day is new stored data, and so is the working-day start on the employee record. This reverses the PRD's «no new stored data» (§1, §6.1).
- **Rate model:** the weekly rate is removed; every allocation becomes a daily time interval. Existing weekly-rate allocations are converted.
- **Rules:** a new **time overlap** warning next to the per-day and per-week overbooking checks, in every save warning.
- **Every write path:** forms, import, history and the migration of existing allocations.

### Decisions (2026-11-21, author)

| # | Question | Decision |
|---|---|---|
| 1 | Time on an allocation: required or optional? | **Required for every allocation.** Existing allocations get a time by migration (#6). |
| 2 | How does the rate map to time of day? | **Time interval per day** (e.g. 09:00–13:00), the same on every working day the allocation covers; hours per day = interval length. |
| 3 | Weekly rate («20h/week»)? | **Removed.** Only daily intervals. Existing weekly-rate allocations are converted to hours per day (weekly rate ÷ working days per full week). In weeks with a public holiday or leave the week total is now lower than before. |
| 4 | Where are working hours stored? | **On the employee record:** the working-day start (default 09:00). The end = start + daily capacity (40h / 5 days → 09:00–17:00; 20h / 5 days → 09:00–13:00). Capacity rules unchanged. |
| 5 | Two allocations overlap in time, day within capacity? | **Warning**, same dialog and «only what the change makes worse» rule as overbooking; saves after confirmation. |
| 6 | Migration of existing allocations | **All start at the resource's working-day start.** Several allocations on one day therefore overlap after migration until planners re-time them. |
| 7 | Part-day leave? | **No.** Leave stays whole days and fills the whole working day. |
| 8 | Time step | **15 minutes** (matches the form's 0.25 h step). |
| 9 | Allocation outside working hours | **Allowed silently** — no warning; the timeline marks the part outside working hours. |
| 10 | Time zone | **One company time zone** (the one «today» and public holidays already use). |
| 11 | Who sees times of day | **Same as the board:** view-whole-board or edit-allocations see everyone; a resource sees their own. No new permissions. |

### Still open (carried to PRD §8)

- Rounding when a converted weekly rate is not a multiple of 15 minutes (e.g. 10h/week over 3 days). Default: nearest 15 minutes, listed to planners.
- How planners learn about migration overlaps and lower holiday-week totals. Default: release note plus a one-time list.
- Whether dragging on the timeline (15-minute steps) is part of stage 3 or follows stage 2's funding. Default: follows stage 2.
- Evidence of need: the planner survey (2026-11) named day-by-day planning, not time of day, as the spreadsheet's reason. The override rationale needs a source.

### What the change touches

| Area | Change |
|---|---|
| idea-brief | §13 scope change note, §5 out-of-scope update, §14 row |
| CONTEXT.md | New terms via `/sdlc:fix-term`: **working hours** (working-day start + daily capacity), **time interval**, **time overlap**; update **allocation** (no weekly rate) |
| Size | Re-run `/sdlc:classify-size` — expected M → L (new stored data, migration) |
| PRD | §1 override, §2 goal, §3, stage 3 US-08–US-10, AC-21–AC-30, §6, §6.1, §8 — done as a draft; then `/sdlc:clarify-prd` |
| resource-scheduling | Amended AC: allocation form (no per-week rate), import format, employee record form |
| Design | V3 prompts: «Day · timeline» group, allocation form with times, overlap warning, employee record working-day start |
