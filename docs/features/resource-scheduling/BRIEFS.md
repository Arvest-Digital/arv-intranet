# Briefs — resource-scheduling

Parked ideas and follow-ups that were discussed but not taken into the MVP scope. Each brief records the context, what is already prepared, the decisions still open and what a change would touch, so the discussion can resume without re-deriving it.

---

## B-01: Day-level board view (columns per day)

- **Status:** Deferred — to be revisited (raised 2026-11-14)
- **Owner of the decision:** PM (product rule), Tech Lead (scope and estimate)
- **Tracked in:** [PRD §8](./PRD.md#8-open-questions) open question; [PRD §3](./PRD.md#3-non-goals) note
- **Origin:** design V1 (Claude Design canvas «Schedule — by people») shows the board with one column per day, allocation bars and drag-and-drop; the approved PRD and ADR-0002 define a weekly board. The design gap review of 2026-11-14 recorded it as a conflict and deferred it.

### Idea

Offer a read-only board zoom that shows one to four weeks with a column per day: each resource's allocated hours against their daily capacity, leave days and public holidays per day — the V1 look, without drag-and-drop.

### What the MVP does instead

- The board is weekly in every zoom. Zoom presets «1 week · 4 weeks · 12 weeks» only change the `weeks` window parameter (the contract already allows 1–12).
- The 1-week zoom renders a wide detail cell per resource (state, «allocated/capacity», hours per project, «away · N days») — the closest weekly equivalent of a day view, and the board's phone layout.
- Drag-and-drop and day-level editing stay non-goals (PRD §3).

### Why it is cheap to add later (no rework, only additions)

- **Data model:** no change. Allocation segments, working days, public holidays and the employment period are already stored.
- **Domain:** capacity and the rate spread are already computed per day (T18); weekly figures are the per-day results summed by ISO week (T20). Ticks of 1/420 minute (ADR-0009) keep daily shares exact. T18/T20 Notes require the per-day functions to stay exported so a day view reuses the same rules.
- **Contract:** additive — e.g. `granularity=day` on `GET /scheduling/board` (window capped at ~4 weeks) or a separate endpoint, with a new day-cell schema. `BoardCell` and existing clients stay unchanged.
- **UI:** one more option in the zoom switch; T39 and design Prompt 1c already ask for a segmented control with room for a «Days» option. Window and zoom live in the URL (ADR-0002).
- **Cost on read:** ADR-0005 already recomputes ~8,400 resource-days per 12-week window; a 4-week day window is smaller.

### Decisions needed before it can be specified

1. **Is it needed at launch?** The deciding criterion: do planners need it on day one to retire the planning spreadsheet (PRD §2 goal)? If not, it stays a post-launch feature with its own PRD.
2. **Where is overbooking judged?** Today overbooking is judged per week (AC-10): 6 h on Monday and 10 h on Tuesday against 8 h/day is not overbooked if the week fits. Options:
   - **(a) Recommended:** keep the weekly rule; days are informational (a day over its daily capacity may be hinted, never flagged as overbooked). Touches only the board read path.
   - **(b)** Introduce a daily overbooking warning. Changes AC-10 and AC-15, the save-time warnings, the import preview, the project-close preview and the T20 rule tables.
3. **Read-only or editable?** Read-only is the safe first step; day-level editing and drag-and-drop are a separate, larger decision.
4. **Window and latency:** maximum days per window (proposed ≤ 4 weeks) and a p95 target next to the existing board target (PRD §6).
5. **Leave and holidays per day:** how leave days, half-weeks and holidays are drawn (the domain already knows them).

### What a change would touch

| Area | If done now (inside the MVP) | If done later (follow-up feature) |
|---|---|---|
| PRD | US-01 extension, new AC for the day view, NFR row for the day window, update §3 non-goals and close the §8 question | New feature PRD referencing this brief |
| SAD / ADRs | ADR-0002 window limits for the day zoom; §4 URL params; §6 flow 3 note; ADR-0005 cost note | Same, as an addendum |
| Contract | `granularity=day` (or new endpoint) + day-cell schema; `api-sync-report.md` reconcile | Same (additive, no breaking change) |
| Data model | None | None |
| Tasks | T20 (daily figures), T25 (query), T28 (route), T39 (zoom + cells), T44 (e2e) and their tests | New tasks in the follow-up epic |
| Design | «Days» option in the zoom switch, day-column artboards (V2 page) | Same |
| Estimate | Roughly +M to L on the current feature, plus a product decision before development starts | Similar work, paid after launch |

Option (b) of decision 2 adds AC-10/AC-15, import-preview and close-preview changes on top of either column.

### Recommendation (as of 2026-11-14)

Keep it out of the MVP unless the PM confirms planners need it at launch. If it is needed now, first confirm decision 2 = (a) (weekly overbooking, days informational), then update PRD → SAD/ADR-0002 → contract → tasks → design in one pass.

### Prepared so far

- PRD §3 note and §8 open question (owner PM, due 6 weeks after launch).
- T18 / T20 Notes: per-day functions exported; weekly figures built from days.
- T39: zoom presets via `weeks`, segmented control with room for «Days».
- Design: the V2 page of the Claude Design canvas has the zoom switch «1 week · 4 weeks · 12 weeks» and the 1-week detail cell.
