# Claude Design prompts — schedule-daily-view (page V3)

Canvas: «Schedule — by people» (pages V1, V2, Navigation example). Source of truth: [PRD](./PRD.md).
Send prompt 0 first, then one prompt per message, in order. Each later prompt assumes prompt 0 was sent.

Scope — screens touched by the PRD, and the V2 screens they build on:

| # | V3 screen group | Builds on V2 | PRD | Stage |
|---|---|---|---|---|
| 1 | Day view · by people (default, 1 week, 4 weeks) | Board · default / 1 week / 4 weeks | AC-01, AC-02 | 1 |
| 2 | Day view · by project | Board by project · default | AC-01b | 1 |
| 3 | Day view · start a change (select days, click bar) | Board · default + Allocation · create / edit, Leave · book | AC-09, AC-10 | 1 |
| 4 | Day view · read-only viewer, hidden leave and end date | Board · read-only viewer | AC-05, AC-11 | 1 |
| 5 | Day view · bad link, window limits, no access | Board · no access, Forbidden | AC-02, AC-03, AC-04 | 1 |
| 6 | Weekly board · week overbooked by a day | Board · default, Board · row expanded, Legend | AC-07 | 1 |
| 7 | Overbooking confirm · per day and per week | Allocation · overbooking confirm | AC-06, AC-08 | 1 |
| 8 | Employee record and Holiday impact confirms name days | Employee record · capacity impact confirm, Holiday · impact confirm | AC-07 | 1 |
| 9 | Who's free · free hours counted day by day | Who's free · drawer | AC-07 | 1 |
| 10 | My schedule · day view | My schedule | AC-12, AC-07 | 1 |
| 11 | Drag to move | — (new) | AC-13, AC-15 | 2 |
| 12 | Drag an edge to stretch / shorten | — (new) | AC-19 | 2 |
| 13 | Refused drops | Allocation · conflict, closed project / past | AC-14, AC-16, AC-17, AC-18 | 2 |
| 14 | Keyboard move / resize | — (new) | AC-20 | 2 |
| 15 | Day · timeline (planner, viewer, own) | — (new) + Day view | AC-21, AC-22, AC-26, AC-29, AC-30 | 3 |
| 16 | Allocation form with times + overlap warning | Allocation · create / edit / errors, Overbooking confirm · per day (V3) | AC-23, AC-24, AC-25 | 3 |
| 17 | Employee record · working-day start; migration notice | Employee record · form | AC-27, AC-28 | 3 |

Not touched (stay in V2 only): navigation, People list, Teams, Projects list/create/close, Holidays list/add, Import, History, Allocation remove, Allocation create/edit/errors in stages 1–2 (reused as-is from the day view; stage 3 changes them in prompt 16), Leave conflict confirm (unchanged wording).

---

## 0. Context (send first)

```text
Add a new page "V3" to this canvas (after V2). Everything I ask for in this and the following messages goes onto V3 only. Do not change any artboard on V1, V2 or "Navigation example".

V3 shows what changes for the feature "schedule day view". Build each V3 artboard by copying the matching V2 artboard (same shell, sidebar, toolbar, tokens, type, icons, data people and projects) and changing only what I describe. Keep V2's conventions:
- each screen in four variants: light, dark, phone (390×844), phone dark; desktop 1440 wide;
- artboard titles like V2: "Day view · default", "Day view · default · dark", "… · phone", "… · phone · dark";
- one title1 note above each group of four, like V2 ("Day view · by people — light · dark · phone · phone dark");
- today is Wed 18 Nov 2026 (W47); W48 = 23–29 Nov, W49 = 30 Nov–6 Dec.

What the feature is (one sentence): the schedule board gets a second zoom level — a day view of 1 to 4 weeks with one column per day — showing each person's allocated hours against their daily capacity per day, allocations as bars across the days they cover, leave and public holidays. Overbooking is now judged per day as well as per week everywhere (board, day view, My schedule, Who's free, every save warning).
Shared rules for every V3 screen:
- Day cell figure: "allocated/daily capacity", e.g. "4/8", rounded to the nearest half hour. Leave day: "Away" instead of figures. Weekend, public holiday, the person's non-working day, and days after employment end for people who may see it: non-working style, "—".
- Day states, distinguishable WITHOUT colour (icon or pattern + text, same icons as the V2 legend): Free, Partly booked, Fully booked, Overbooked (icon + "+8h" style excess), Away, Non-working, Public holiday, Past (view only).
- A leave day that also has work hours shows "Away", those work hours, and the overbooked mark.
- Overbooked weeks name their overbooked days, e.g. "W48 · 40/40 · overbooked on Wed".
- Text contrast ≥ 4.5:1, touch targets ≥ 44 px on phone, real buttons and links.
Reply with the V3 page link when it exists; build nothing else yet.
```

---

## 1. Day view · by people (Stage 1 · AC-01, AC-02)

```text
On V3, add the group "Day view · by people": three screens × light / dark / phone / phone dark, built from V2 "Board · default", "Board · 1 week" and "Board · 4 weeks".

Toolbar: next to "By people | By project" add a segmented control "Weeks | Days" (Days pressed). In Days the zoom control offers 1 · 2 · 3 · 4 weeks (not 1–12); the window label reads "W47–W48 · 16–29 Nov 2026". Prev / next arrows and "Today" stay. Team and project filters stay and still apply.

Grid: one column per day, grouped under week headers ("W47 · 16 Nov" … ), day headers "Mo 16", "Tu 17"…; Sat/Sun narrower and in non-working style; today's column marked; days before today in the "past, view only" style with the existing V2 past banner text adapted to days.

Each person row has two layers:
1) a per-day figure strip: "4/8", "8/8", "16/8 · +8h" (overbooked, icon), "Away", "—";
2) bars below it: one bar per allocation across the days it covers, labelled with project chip and "4h/day" (or "20h/wk"); leave is its own bar labelled "Away" (planner variant shows the leave type, e.g. "Annual leave"). Overlapping allocations stack.

Scenario for the first row (Olena Kovalenko, 40h, Mon–Fri): Atlas CRM 20h/week from Mon 16 Nov to Wed 25 Nov; annual leave Thu 26 Nov; public holiday Mon 23 Nov. Add one row with an overbooked Wednesday that is "40/40" for the week (Iryna Bondar: Atlas CRM 8h/day Mon–Wed + Cobalt billing 8h/day Wed–Thu → Wed "16/8 · +8h"). Add a row where a leave day also has 4h of work ("Away · 4h" + overbooked mark). Keep the left column (avatar, name, team) and team grouping from V2.

Variants: "Day view · default" = 2 weeks; "Day view · 1 week"; "Day view · 4 weeks" (columns get narrow: show figures only, bars show the chip and truncate the label, full text on hover).
Phone: the board's day view is VIEW-ONLY (no selection, no click-to-edit): 1 week, horizontal scroll inside the grid with the name column sticky, no "New allocation" action in the day view.
Legend: add the day states (Free, Partly, Fully, Overbooked "16/8", Away, Non-working, Public holiday).
```

## 2. Day view · by project (Stage 1 · AC-01b)

```text
On V3, add "Day view · by project" (light / dark / phone / phone dark), built from V2 "Board by project · default" plus the day grid from "Day view · default".

"By project" is pressed together with "Days". Same 2-week window, filters and figures as the by-people day view. For each project: a header row with its total allocated hours per day (leave excluded), e.g. "12", "12", "—"; under it one row per person on that project: their hours on this project per day, with their whole-day figure next to it in a quieter style, e.g. "4 · 8/8" and "8 · 16/8 +8h" for an overbooked day.
All leave sits in one "Away" group at the bottom: planners see leave types; for a viewer without the see-leave-reasons permission show it as one "Away" group with no leave type and no leave project name (show that viewer state in the phone variant, and note it in a small sticky next to the group).
Allocations past an employment end date stay hidden from viewers who may not see it — no special mark.
```

## 3. Day view · start a change (Stage 1 · AC-09, AC-10)

```text
On V3, add "Day view · select days" and "Day view · click a bar", each light / dark only (no phone variants: the phone day view is view-only — add one sticky saying so).

"Day view · select days": in Olena Kovalenko's row, Tue 24 – Thu 26 Nov are selected as one continuous range (selection outline + light fill, keyboard-focus ring style, never across rows). A small anchored menu next to the selection: header "Olena Kovalenko · Tue 24 – Thu 26 Nov · 3 working days", buttons "New allocation" (primary) and "Book leave", and "Esc to cancel".
Second frame of the same group, "Day view · select days → form": the existing V2 "New allocation" dialog over the day view, with Resource = Olena Kovalenko and Start 24 Nov / End 26 Nov prefilled (a quiet "Filled from your selection" note). The form itself is unchanged.

"Day view · click a bar": the user clicked an Atlas CRM bar; the existing V2 "Edit allocation" dialog opens with current values over the day view. Show the same V2 rules in the dialog (started in the past → start date locked, "Changes apply from today (18 Nov)").
```

## 4. Day view · read-only viewer, hidden leave and end date (Stage 1 · AC-05, AC-11)

```text
On V3, add "Day view · read-only viewer" (light / dark / phone / phone dark), built from V2 "Board · read-only viewer" and the V3 day view.

Viewer has view-whole-board only. No "New allocation" / "Book leave" buttons; selecting days does nothing (no selection style, cursor default); bars are not draggable (no grab handles). Clicking a bar opens a READ-ONLY details popover (like V2's popover, without Edit / Remove): project, dates, rate, total hours; for leave only "Away" and the dates — no leave type, no leave project.

Same frame shows a person (Marko Ivanov) on sick leave Mon 23 Nov whose employment ends Wed 25 Nov: this viewer sees "Away" on Mon 23 (no type), and from Thu 26 Nov on "0/0" zero capacity with no bars, no overbooking and NO end-of-employment mark. Add a sticky: "Viewer without see-leave-reasons / manage-employee-records / edit-allocations".
```

## 5. Day view · bad link, window limits, no access (Stage 1 · AC-02, AC-03, AC-04)

```text
On V3, add three small screens, each light / dark / phone / phone dark:

"Day view · window limit": the day view moved to the furthest allowed week (52 weeks ahead): the "next" arrow is disabled with a tooltip "The day view goes up to 52 weeks ahead"; same idea for 12 months back (show it as a second note, not a second screen).

"Day view · link out of range": opened via a shared link asking for 6 weeks. No grid. Centered message: "This view can't be shown" / "The day view shows 1 to 4 weeks, from 12 months back up to 52 weeks ahead." Buttons "Open the day view from today" and "Back to weeks".

"Day view · no access": user with neither view-whole-board nor edit-allocations, built from V2 "Board · no access": "You don't have permission to view the team schedule" + primary "Open my day view". Second frame for a user who is not a resource: "You have no schedule to show" with no button.
```

## 6. Weekly board · week overbooked by a day (Stage 1 · AC-07)

```text
On V3, add "Weekly board · day overbooked" (light / dark / phone / phone dark), built from V2 "Board · default" (Weeks mode, with the new "Weeks | Days" switch in the toolbar, Weeks pressed).

Change: a week can now be overbooked even when its total is within capacity. Iryna Bondar's W48 cell shows "40/40" in the overbooked state with "Wed +8h" as its sub-line (icon, not colour only). Another person's W49 shows "48/40 · +8h over" (classic week over) — keep both side by side so the difference reads.
Popover on Iryna's cell: "Iryna is overbooked on Wed 25 Nov by 8h (16/8). W48: 40/40." plus a link button "Open W48 in day view".
Expanded row (from V2 "Board · row expanded"): the per-allocation lines keep their weekly hours; add a quiet line "Overbooked day: Wed 25 Nov".
Legend: "Overbooked" example becomes "48/40 or a day over".
Add one banner variant (sticky + banner across the board top, dismissible): "Overbooking is now checked per day. 6 weeks show as overbooked because a single day is over capacity. See the list" — this is the open question for planners (PRD §8), mark it as a proposal in the note.
```

## 7. Overbooking confirm · per day and per week (Stage 1 · AC-06, AC-08)

```text
On V3, add "Overbooking confirm · per day" (light / dark / phone / phone dark), built from V2 "Allocation · overbooking confirm".

Scenario: Iryna Bondar has Atlas CRM 8h/day Mon–Wed W48; the user adds Cobalt billing 8h/day Wed 25–Thu 26 Nov. Week total 40/40.
Replace the single "Overbooked weeks" table with two sections:
- "Overbooked days" table: Day | Capacity | Allocated | Over → "Wed 25 Nov | 8h | 16h | +8h".
- "Weeks" table: Week | Allocated / capacity | Over | Overbooked days → "W48 · 23 Nov | 40/40 | — | Wed". Show "Over" only when the week's total exceeds capacity; add a second row "W49 · 30 Nov | 48/40 | +8h | —" in a second frame to show the other case.
Title: "Iryna will be overbooked". Body: "This change makes 1 day and 1 week worse. Only what this change makes worse is listed." Buttons "Back to edit" / "Save anyway". Keep the availability preview in the dialog but make the week bars mark the overbooked day (small marker on the bar).
Add a sticky: "No confirmation when a change makes no day or week worse (e.g. moving hours off an already overbooked Wed)."
```

## 8. Employee record and Holiday impact confirms name days (Stage 1 · AC-07)

```text
On V3, add two screens (light / dark / phone / phone dark each), built from V2 "Employee record · capacity impact confirm" and "Holiday · impact confirm".

In both, the impact table gets an "Overbooked days" column and day rows: Resource | Week | Allocated / capacity | Over | Overbooked days. Example for the holiday "Christmas Day · Fri 25 Dec 2026": "Olena Kovalenko | W52 | 32/32 | — | Thu 24 Dec (+4h)" and "Marko Ivanov | W52 | 36/32 | +4h | —". Intro text: "These days and weeks would become overbooked." Keep "Allocations are not changed." and the existing buttons.
For the employee record (contract hours 40 → 32, working days Mon–Thu): rows name days such as "Fri 27 Nov — no longer a working day, 8h booked".
```

## 9. Who's free · free hours counted day by day (Stage 1 · AC-07)

```text
On V3, add "Who's free · per-day count" (light / dark / phone / phone dark), built from V2 "Who's free · drawer".

Rule change shown by data: a week's free hours = sum over working days of (daily capacity − allocated) where above zero; "0 · overbooked" only when the week's total exceeds capacity.
Show a row for Iryna Bondar with a week booked 8, 8, 16, 8, 0 (Mon–Fri): the week chip reads "8h free" with a small overbooked-day marker "Wed over" — not "0 · overbooked". Keep another person with "0 · overbooked" for a week whose total is 48/40.
Add a hint line under the drawer header: "Free hours are counted day by day." Nothing else changes.
```

## 10. My schedule · day view (Stage 1 · AC-12, AC-07)

```text
On V3, add "My schedule · day view" (light / dark / phone / phone dark), built from V2 "My schedule" (Sofia Lys · Design · 40h per week, Mon–Fri).

Add the "Weeks | Days" switch to the My schedule header. Days: 2 weeks on desktop (zoom 1–4), 1 week on phone; same limits and arrows as the board. Per day: "8/8", "4/8", "Away · Annual leave" (her own leave type IS shown), public holiday, weekend; her allocations as bars per day with project chip and hours/day; an overbooked Wed "12/8 · +4h".
Read-only: no selection, no drag, the V2 note "Your schedule is read-only. Ask a planner to change an allocation." stays.
Phone (390 px): one week as a vertical list of days (Mon 23 Nov → Sun 29 Nov), each day a card with figure, state and allocations — fully readable without horizontal scroll.
Also in Weeks mode: an overbooked-by-day week shows "40/40" in the overbooked state with "Wed +8h".
```

---

> **Status 2026-11-21:** prompts 0–10 (stage 1) are applied on V3 in the version above — 80 artboards, weekly rates included. That is correct: stage 1 ships before stage 3, while the weekly rate still exists (PRD §1). Do not redraw them. Send **0b** before prompts 11–17.

## 0b. Context update (send before prompts 11–17)

```text
Context update for V3, before the next screens. Do not change any existing V3 artboard: the stage 1 screens (Day view, Weekly board · day overbooked, Overbooking confirm · per day, impact confirms, Who's free, My schedule) show the product before stage 3 and stay as they are, weekly rates included.

The feature now has three stages:
- Stage 1 (on V3 already): day view, per-day overbooking.
- Stage 2: moving and stretching allocations by whole days with drag and keyboard.
- Stage 3 (new): a one-day timeline. Every allocation has a required daily time interval (e.g. 09:00–13:00, 15-minute steps); there is no "per week" rate any more — existing weekly rates become hours per day; each person has a working-day start on their employee record (working hours = start + daily capacity, e.g. 09:00–17:00); booking one person twice at the same time is warned about in the same dialog as overbooking; work outside working hours is allowed and only marked on the timeline; leave stays whole days; one company time zone.

For every artboard from now on (stages 2 and 3): show allocations in hours per day ("4h/day"), never weekly rates ("20h/wk"). Weekly totals in week cells ("24/40") stay. Stage 2 and stage 3 screens each get their own title note, like the stage 1 groups.
Reply "ok" — build nothing yet.
```

## Stage 2 (only if stage 2 is funded)

## 11. Drag to move (Stage 2 · AC-13, AC-15)

```text
On V3, add the group "Stage 2 · gestures" with a title note "Stage 2 — funded only after the post-stage-1 recount". First: "Drag · move" (light / dark only — no gestures on phones).

Desktop day view, Olena Kovalenko's Atlas CRM bar Mon 23 – Wed 25 Nov (not started yet) is being dragged 2 working days later. Show: the original position as a dashed ghost, the bar under the cursor at Wed 25 – Fri 27 Nov, and a floating preview card next to it:
"Wed 25 – Fri 27 Nov · 3 working days · 24h"
"W48: 32/40" (per affected week, allocated vs capacity)
"Makes worse: Thu 26 Nov +4h (12/8)" — or "No overbooking" in neutral style.
Bars move by working days: weekends and holidays are skipped (show a skipped holiday column with a "skipped" hint under the ghost).
Second frame "Drag · move → confirm": after letting go onto an overbooked day, the V3 "Overbooking confirm · per day" dialog opens with the bar held in its new place; Cancel puts it back (show a quiet "Cancel returns the allocation to Mon 23 – Wed 25 Nov").
Third frame "Drag · leave": dragging an "Annual leave" bar onto days with work shows the same leave-conflict warning wording as the V2 "Leave · conflict confirm".
Bars show a grab cursor and a 6-dot grip on hover; started allocations show a lock icon instead of the grip.
```

## 12. Drag an edge to stretch / shorten (Stage 2 · AC-19)

```text
On V3, add "Drag · stretch" (light / dark). Allocation: Cobalt billing 4h/day for three full weeks W47–W49 (Sofia Lys, Mon–Fri). The user drags its end edge 2 working days into W50.
Show: edge resize handles on both ends of the bar (visible on hover/focus), the bar extended into Mon 7 – Tue 8 Dec, and a preview card:
"Ends Tue 8 Dec (was Fri 4 Dec)"
"Stays 4h/day"
"W50 gets 8h of this allocation"
"W50: 8/40 · no overbooking".
Second frame: dragging the start edge of a started allocation — the edge handle shows a lock and a tooltip "Started allocations can only change their end".
Third frame: dragging an edge of an "Annual leave" bar adds whole working days; preview "Adds Thu 26 Nov · 8h of capacity" and names any work on the new day.
```

## 13. Refused drops (Stage 2 · AC-14, AC-16, AC-17, AC-18)

```text
On V3, add "Drag · refused" (light / dark): one artboard with four stacked frames of the same day view, each after a refused drop. In each the bar has snapped back to its original place (show a brief "returned" outline) and an inline toast near the bar (role=alert, icon + text, "Dismiss"):
1) Past: "Past plans are not rewritten. You can change the end from today (18 Nov)."
2) Employment period: "Olena's employment ends on 15 Dec. 15 Dec is the last date she can be allocated."
3) Closed project: "Cobalt billing is closed and accepts no changed allocations."
4) Concurrent edit: "Marko Ivanov changed this allocation meanwhile. It now runs Tue 24 – Thu 26 Nov." — the bar shows at Marko's position, not the user's.
5) Lost permission: "You no longer have permission to edit allocations." — after this, grips disappear from all bars.
Reuse the V2 error-banner style from "Allocation · conflict" and "Allocation · closed project / past".
```

## 14. Keyboard move / resize (Stage 2 · AC-20)

```text
On V3, add "Keyboard · move and resize" (light / dark). A focused Atlas CRM bar (visible focus ring) with a small action menu opened by Enter: "Move", "Change start", "Change end". "Move" is active: the bar shows the same ghost + preview card as "Drag · move", and a keyboard hint bar at the bottom of the board: "← → one working day · Enter confirm · Esc cancel". Second frame: "Change end" active, preview as in "Drag · stretch". Third frame: after Enter onto an overbooked day, the same per-day overbooking confirm dialog. Screen-reader live text under the preview (visually hidden, show it in a sticky): "Moved to Wed 25 – Fri 27 Nov. W48 32 of 40 hours. No overbooking."
```

---

## Stage 3 — time of day

## 15. Day · timeline (Stage 3 · AC-21, AC-22, AC-26, AC-29, AC-30)

```text
On V3, add the group "Stage 3 · time of day" with a title note "Stage 3 — one-day timeline". First: "Day · timeline" (light / dark / phone / phone dark).

New zoom level: the "Weeks | Days" switch becomes "Weeks | Days | Day". Day = one date, e.g. "Tue 24 Nov 2026", with prev / next day arrows and "Today". A day header in the Days grid links to its timeline.
Layout: name column on the left (as the board), a horizontal time axis 08:00–18:00 (hour ticks, 15-minute minor ticks), widening when a block starts earlier or ends later. Per row:
- working hours as a quiet band (Olena Kovalenko 09:00–17:00; a part-timer, Sofia Lys, 09:00–13:00);
- allocations as blocks at their times with project chip and "4h": Atlas CRM 09:00–13:00, Cobalt billing 14:00–16:00; the day figure "6/8" at the row end;
- leave: one block filling the working hours labelled "Away" (planner: "Annual leave");
- public holiday: whole row non-working;
- overlap: Iryna Bondar has Atlas CRM 09:00–13:00 and Cobalt billing 11:00–12:00 — the overlapping hour is hatched with an overlap icon and "Booked twice 11:00–12:00" (not colour only);
- outside working hours: a block 17:00–19:00 drawn past the band with a dotted edge, no warning icon;
- a "now" line at the current time on today.
Second frame "Day · timeline · read-only viewer": no create/edit affordances, leave shows "Away" without type, a person after their employment end shows no band and no blocks.
Phone: own schedule only ("My schedule · day"): a vertical list of time blocks for the day (09:00–13:00 Atlas CRM · 4h, …), working hours at the top, overlap shown inline. The board's timeline on phone is view-only with horizontal scroll and a sticky name column.
```

## 16. Allocation form with times + overlap warning (Stage 3 · AC-23, AC-24, AC-25)

```text
On V3, add "Allocation · times" (light / dark / phone / phone dark), built from V2 "Allocation · create" and "Allocation · edit".

Replace the Rate block ("hours · per day | per week") with: "Time each working day" — Start "09:00" and End "13:00" time pickers in 15-minute steps, and a computed line "4h per day · 12 working days · 48h in total". No "per week" option anywhere. Keep dates, project, resource, the availability preview (week bars) and the V2 notes.
Second frame "Allocation · times · errors" from V2 "Allocation · validation errors": "End must be after start" and "Times go in 15-minute steps".
Third frame "Overlap and overbooking confirm" from the V3 "Overbooking confirm · per day": add a section "Booked twice" above "Overbooked days": Day | Time | Projects → "Tue 24 Nov | 11:00–12:00 | Atlas CRM, Cobalt billing". Title "Iryna will be booked twice". Same "Only what this change makes worse is listed." line and "Back to edit" / "Save anyway". Show one variant with both overlap and an overbooked day.
```

## 17. Employee record · working-day start; migration notice (Stage 3 · AC-27, AC-28)

```text
On V3, add "Employee record · working hours" (light / dark / phone / phone dark), built from V2 "Employee record · form".
Add a field "Working day starts" (time picker, 15-minute steps, default 09:00) under "Working days". Extend the capacity line: "Capacity: 8h per working day · 40h per full week · working hours 09:00–17:00". Changing the start shows "Allocations are not moved."

Add one board banner variant "Times added to every allocation" on the V3 "Day · timeline" (sticky + dismissible banner, mark it as a proposal — PRD §8): "Every allocation now has a time of day. Existing ones start at each person's working-day start, so 14 days show people booked twice. Weekly rates became hours per day. See the list". The linked list (second frame): Resource | Day | Overlapping allocations | Action "Open day".
```
