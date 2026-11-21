---
status: Confirmed
owner: "dmitro.b"
reviewers: []
updated_at: "2026-11-21"
feature_size: TBD     # set by sdlc:classify-size, not here
stage: "01"
depth: medium
ticket: "BRIEFS B-01 (docs/features/resource-scheduling/BRIEFS.md)"
value_score:
  rice: 1.8
  state: confirmed
  confirmed_at: "2026-11-21"
feasibility_state: confirmed
---

<!-- Stage 01 → see SDLC/plugin/skills/interview/SKILL.md -->

# Idea Brief — Schedule daily view

## 1. Raw idea
«Offer a read-only board zoom that shows one to four weeks with a column per day: each resource's allocated hours against their daily capacity, leave days and public holidays per day — the V1 look, without drag-and-drop.» — verbatim from [BRIEFS B-01](../resource-scheduling/BRIEFS.md#b-01-day-level-board-view-columns-per-day).

Interview note (2026-11-21): the idea owner widened the target scope to **full editing on the day view, including drag-and-drop**.

## 2. Problem
The schedule board is weekly. Planners can see that a resource has 24 of 40 hours booked in a week, but not which days are free, which days someone is away, or what sits on Monday versus Friday. To plan day by day they keep the old planning spreadsheet next to the board. That defeats the scheduling MVP's main goal: retire the spreadsheet rather than run it alongside ([PRD §2](../resource-scheduling/PRD.md#2-goals)).

## 3. Users
- **Planners** (~5: PMs, delivery managers, team leads who hold the edit-allocations permission) are the primary segment. They rebalance people weekly and are the ones keeping the spreadsheet.
- **Scheduled employees** (~30) get a secondary benefit: they can read their own schedule day by day. They do not edit.
- How often: every planning round, at least weekly, plus ad-hoc changes when leave or a project start shifts.

## 4. Why now
Planners are asking for a day view and still keep the planning spreadsheet alongside the newly shipped board. The question is already open in [PRD §8](../resource-scheduling/PRD.md#8-open-questions) (owner PM, due 6 weeks after launch). There is no hard deadline, but the longer two planning places run in parallel, the more they diverge.

## 5. Out of scope
- Different hours on individual days within one allocation. The allocation model stays a fixed rate per day or week (from stage 3: one fixed time interval per day — see §13 «Scope change»).
- Part-day leave and per-employee time zones (stage 3 keeps leave whole-day and one company time zone).
- Dragging an allocation onto another person (reassignment). Done today by deleting and creating again.
- Multi-select, bulk or batched moves, and a staging tray.
- Scenarios, what-if branches, tentative bookings.
- Gesture editing on phones. The phone layout keeps forms.
- A per-day overbooking rule. Overbooking stays weekly (§13); see §15 for the open product question.

## 6. Competitive analysis

| # | Product · URL | Features | Value per feature (1-5) | Gap |
|---|---|---|---|---|
| 1 | Float · https://support.float.com/en/articles/4188692-allocate-time | Drag across days to create; per-day overbooking in red; holidays bookable at usual hours; split for overtime | create-by-drag 5 · daily flag 3 · split 3 | Only a per-day colour flag, no weekly "warn, then allow" judgement¹ |
| 2 | Resource Guru · https://help.resourceguruapp.com/en/articles/1955778 | "Clash" dialog: waiting list / add as overtime / extend availability; overtime bar per day | clash choices 4 · overtime bar 3 · waiting list 1 | Modal on every clash, per-day judgement; waiting list is overkill for ~5 planners² |
| 3 | Runn · https://help.runn.io/en/articles/3386862-managing-assignments | Click-drag to create; quick editor linking hours/day, work days and total; split, clone, transfer, bulk move; time off excluded automatically | linked editor 5 · split/clone 4 · bulk 3 | No day-column view found (Week is the finest); no confirmation when a drag passes capacity³ |
| 4 | Toggl Plan · https://toggl.com/use-cases/visual-planning | Timeline drag and resize; separate day/week calendar; leave and holidays reduce capacity; "Unplanned" panel | drag/resize 4 · unplanned panel 3 | Day work sits in a different view from the timeline; overbooking threshold not documented⁴ |
| 5 | Teamdeck · https://teamdeck.io/features/ | Stretch, cut, copy bookings; overlap and over-time warnings; underbooked view; part-time hourly availability | stretch/cut 4 · warnings 3 | Unclear whether a resize past capacity is blocked or only warned⁵ |

All rows 2026-11-21. Queries: ¹ "Float … day view drag and drop overbooked" · ² "Resource Guru … drag and drop overbooking day view" · ³ "Runn … drag and drop daily view overallocation" · ⁴ "Toggl Plan … drag drop resize day view" · ⁵ "Teamdeck … drag and drop resize overbooked". ¹–³ from fetched help pages; ⁴–⁵ from search summaries only.

Not covered: Hub Planner (its docs redirected to another vendor), Forecast/Productive, Teamwork.

**Key gap:** every verified tool judges capacity per day and either flags it or interrupts with a dialog. None combines day-column editing with a weekly "warn once, then allow" check, which is how these planners already work.

## 7. Strategic approaches

### Approach A — Read-Only Day Zoom
- **Thesis:** a 1–4-week zoom with a column per day; clicking a day or bar opens the existing form pre-filled.
- **For whom:** planners who keep the spreadsheet mainly to *see* day detail. **Metric:** spreadsheet keepers TBD → 0 in 6 weeks.
- **Key trade-off:** no drag-and-drop; every change still goes through a form. **Effort:** S (~1.5 person-weeks). **Recommended?** ◯

### Approach B — Live-Consequence Planning Canvas
- **Thesis:** drag, stretch, draw and reassign allocations on days, with live recalculation of each affected week, staged batches, one confirmation and one-click undo.
- **For whom:** planners who rebalance several people at once. **Metric:** spreadsheet keepers → 0 and no edits after archiving, by week 6.
- **Key trade-off:** batch saving brings the largest interaction, accessibility and testing load. **Effort:** L (8–12 person-weeks). **Recommended?** ◯

### Approach C — Staged Day View, Gesture Editing
- **Thesis:** Planners get a day-by-day board they can edit in place. Stage 1: select days or click a bar to open a pre-filled form. Stage 2: drag to move or stretch an allocation by whole days. Every save keeps the weekly overbooking warning they already trust.
- **For whom:** planners with the edit-allocations permission; employees get the read-only day view of their own schedule.
- **Outcome metric:** planners keeping a spreadsheet: baseline counted at kickoff → 0 within 6 weeks of stage 2. Supporting: share of allocation changes made from the day view (from change history).
- **Key trade-off:** editing stays whole-allocation and whole-day, with no per-day hours and no reassignment. In return the warning, import and project-close rules stay unchanged.
- **Effort signal:** M (~4.5 person-weeks: ~2 for stage 1, ~2.5 for stage 2)
- **Recommended?** ●

## 8. Multi-perspective feedback

### Engineer
- A is a read view only; it reuses the per-day figures and every existing save rule.
- B needs the capacity rules copied to the client (two calculators that drift) or called per drag frame, plus all-or-nothing batch commits the system lacks.
- C's move and stretch map onto the existing date-range update; risks are the past-date rule mid-drag, weekly-rate prorating and keyboard equivalents.

### Executive
- A is the cheapest test but will not move the metric if editing friction keeps the spreadsheet alive.
- B meets the owner's goal, but 2–3 months for ~5 users costs the next intranet capability.
- C delivers A's value in ~2 weeks and gates the drag-and-drop spend: best business fit.

### UX-researcher
- A is easy to learn but slow for small tweaks (form, save, confirm).
- B feels closest to the spreadsheet, but gestures are hard to discover and pending/part-failed batches erode trust.
- C uses calendar-app gestures with forms as fallback; gaps are undo, reassignment and keyboard access.
- All: a day "over capacity" with no save warning reads as a bug unless the hint is clearly worded.

### Synthesis matrix

|        | Engineer | Executive | UX |
|--------|:--------:|:---------:|:--:|
| App. A | + reuses existing figures and save paths | 0 cheap, may not retire spreadsheet | 0 familiar, but form-heavy for tweaks |
| App. B | − new consistency model, duplicated rules | − too costly for five users | + fluid, spreadsheet-like, heavier mental model |
| App. C | 0 bounded gestures over existing actions | + early value, gated further spend | + familiar gestures, forms remain fallback |

## 9. Trade-offs and edge cases

### Trade-offs per approach
| Approach | Pros | Cons |
|---|---|---|
| A | Cheapest; no new editing risk; quick test of "is seeing days enough" | Editing friction unchanged; falls short of the owner's goal |
| B | Best chance to fully replace the spreadsheet; live consequences; undo | L effort; batch conflicts; two calculators; heavy accessibility load |
| C | Value in ~2 weeks; checkpoint before drag-and-drop spend; reuses every save rule | No per-day hours, no reassignment, no undo; stage 2 may slip without a deadline |

### Edge cases
- Uneven plans ("Mon–Tue on X, Wed–Fri on Y") stored as weekly allocations show as an even daily split.
- Dragging an allocation that started in the past must split at today or refuse, never rewrite the past.
- Weekly-rate allocations stretched by days must prorate predictably and show the result before saving.
- Drags across leave, a public holiday, the employment end or a project close date must explain the outcome.
- A misplaced drop that keeps the week within capacity saves with no confirmation.
- Day figures rounded to half hours may not sum to the week (3 × 6.5 next to "20").
- Another planner edits the same allocation mid-drag; the stale-save refusal must be clear.

## 10. Risks
- **Top (devil's advocate): the day view shows an even daily split that planners never use.** Allocations are a fixed rate spread evenly over working days, so real uneven plans look wrong on the day view and the true day-level plan stays in the spreadsheet. Signals: the spreadsheet is still edited after launch, the number of one-to-two-day allocations per person jumps, and feedback says "the day view is wrong".
- **Privacy:** exact absence days can reveal sick-leave patterns and unannounced end dates to anyone who can see the whole board, bypassing the see-leave-reasons permission's intent.
- **Unverified root cause:** the spreadsheet may survive for reasons a day view cannot fix (tentative plans, rates, habit). The metric would not move and the team would draw the wrong conclusion.
- **Drags that don't land:** past-date, employment, closed-project and leave rules reject or reshape many moves of running work.
- **Mixed signals:** the daily hint conflicts with the weekly rule (alarm fatigue, pressure for a daily rule).
- **Scope stall:** stage 2 slips without a deadline while two planning places diverge.

## 11. RICE — Claude proposed
- **Reach (R): 5** — the ~5 planners from §3. Employees are excluded because the metric measures planners.
- **Impact (I): 2** — the idea directly targets the MVP goal of retiring the spreadsheet (§2), and Executive rates C "+" (§8). It is not 3 because the root cause is unverified (§10).
- **Confidence (C): 0.8** — the user confirmed a real signal from planners. Open items remain (§15: baseline count, root cause, per-day overbooking).
- **Effort (E): 4.5 person-weeks** — Approach C's M signal (§7).
- **RICE = 5 × 2 × 0.8 / 4.5 ≈ 1.8** (for comparison: A ≈ 2.7 with I=1, E=1.5; B ≈ 1.2 with I=3, E=10)
- **State**: confirmed

## 12. Feasibility — Claude proposed

- [☑] **Tech**: the per-day figures and daily capacity already exist and are exported in the scheduling domain (`modules/scheduling/src/domain/weekly-figures.ts`, `capacity.ts`). The save-time overbooking check and the allocation and leave forms exist in `apps/web/app/features/scheduling/`. No new stored data is needed. The web app has no drag-and-drop support yet; adding a package needs approval (§15).
- [☑] **Skills**: the same team just shipped the weekly board, the allocation and leave dialogs, the history panel and the board end-to-end test with an accessibility audit. Gestures with keyboard equivalents are new, but within the existing expertise. Staging keeps them out of stage 1.
- [☑] **Time**: no hard deadline. The whole scheduling feature (44 tasks) went from PRD to merge in ~3.5 weeks (2026-10-28 → 2026-11-21); C is ~4.5 person-weeks with first value in ~2.
- **State**: confirmed

## 13. Recommendation
**Selected: Approach C — Staged Day View, Gesture Editing.** C scores RICE ≈ 1.8 (§11) with Feasibility 3/3 ☑ (§12). It delivers A's day-level visibility in about two weeks and puts a checkpoint before the drag-and-drop spend, which the Executive lens rated "+ early value, gated further spend" (§8). It fills the competitive gap that no verified tool combines day-column editing with a weekly "warn once, then allow" check (§6). It also reuses every existing save rule instead of B's new batch model, which the Engineer lens rated "−" (§8). A has a higher raw RICE (≈ 2.7) but does not deliver the editing the idea owner and planners ask for. C's stage 1 already contains A, so nothing is lost.

Two checkpoints are part of the recommendation:
1. **Before stage 1:** a short survey of the ~5 planners on why the spreadsheet survives, and a baseline count of who keeps one. If the main reason is uneven per-day hours (§10 top risk), revisit the scope before building.
2. **After stage 1:** recount spreadsheet users. Fund stage 2 (drag to move and stretch) only if the spreadsheet is still in use.

**Scope change (2026-11-21, after the PRD draft) — decision override by the author:** a **stage 3, time of day**, is added to this feature in the current iteration: a one-day timeline where every allocation has a required daily time interval (15-minute steps), the weekly rate is removed (existing weekly-rate allocations converted to hours per day), each employee record gains a working-day start, and a time-overlap warning joins the overbooking warning. Leave stays whole days. Rationale and the eleven decisions: [BRIEF B-01](./BRIEF.md#b-01-one-day-view-by-hour-time-of-day). This reverses «no new stored data» (§12 Tech) and the out-of-scope line on per-day hours only as far as stage 3 needs. Effort grows from M towards L; re-run `/sdlc:classify-size`.

**Locked-in pointer** for write-prd: a day-column zoom (1–4 weeks) on the existing board. Overbooking stays weekly, and a day over its daily capacity gets a clearly worded hint, never an overbooked mark. Stage 1 is the read view plus select-to-create and click-to-edit through the existing forms. Stage 2 adds whole-day move and stretch through the existing save path and confirmation, with keyboard equivalents.

## 14. Parked & rejected approaches
| # | Approach | Status | Reason | Revisit trigger |
|---|---|:---:|---|---|
| A | Read-Only Day Zoom | parked (absorbed) | Contained in C's stage 1; on its own it leaves the editing friction | Stage 2 is cancelled at the post-stage-1 checkpoint, so C effectively becomes A |
| B | Live-Consequence Planning Canvas | parked | L effort for ~5 users; new batch consistency model; two calculators | After C ships, planners still keep the spreadsheet because of multi-person rebalancing or the lack of undo |
| - | Time-of-day view (one-day timeline) | adopted as stage 3 (2026-11-21) | Author decision after the PRD draft; see §13 «Scope change» and BRIEF B-01 | — |
| - | Per-day overbooking rule | rejected (for now) | Reopens several existing acceptance criteria, the import preview and the project-close preview, with likely alarm fatigue | Planners repeatedly report daily overload the weekly rule hides |

## 15. Open questions
- [ ] Why do planners still keep the spreadsheet, and how many of the ~5 do (baseline)? Is the main reason uneven per-day hours? — owner: PM, due: before /sdlc:write-prd
- [ ] Should overbooking ever be judged per day? Default now: no, weekly rule plus a daily hint. — owner: PM, due: during /sdlc:write-prd
- [ ] How do we stop the day view exposing sick-leave patterns and unannounced end dates to whole-board viewers? — owner: PM + Tech Lead, due: during /sdlc:write-prd
- [ ] How is a dragged allocation that already started in the past handled (split at today or refuse)? — owner: PM, due: during /sdlc:write-prd
- [ ] Which drag-and-drop support does the web app adopt? A new package needs approval; this is a hard-to-reverse choice for /sdlc:architecture-design, not this brief. — owner: Tech Lead, due: before stage 2
- [ ] Is undo needed in stage 2, or is the change history enough? — owner: PM, due: post-stage-1 checkpoint
- [x] Glossary: add "day view" and "daily capacity" to CONTEXT.md via /sdlc:fix-term. — done 2026-11-21

## Related
- [CONTEXT.md](../../../CONTEXT.md) — allocation, availability, capacity, leave, overbooking, public holiday
- [resource-scheduling BRIEFS B-01](../resource-scheduling/BRIEFS.md#b-01-day-level-board-view-columns-per-day)
- [resource-scheduling PRD](../resource-scheduling/PRD.md) — §2 goals, §3 non-goals, §8 open question, AC-10, AC-15
- [resource-scheduling idea-brief](../resource-scheduling/idea-brief.md)

## DoD self-check
- [x] 15 sections present
- [x] No anti-pattern terms (datastore, broker or library names)
- [x] Length ≤ 5 pages (~2200 words)
- [x] Frontmatter status: Confirmed
- [x] RICE confirmed (state: confirmed)
- [x] Feasibility confirmed (state: confirmed)
- [x] Recommendation present with rationale citing 4 upstream sections (§6, §8, §11, §12)
