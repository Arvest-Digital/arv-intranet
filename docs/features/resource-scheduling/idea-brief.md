---
status: Confirmed
owner: "dmitro.b"
reviewers: []
updated_at: "2026-10-27"
feature_size: M
stage: "01"
depth: hard
ticket: ""
value_score:
  rice: 8.4
  state: confirmed
  confirmed_at: "2026-10-27"
feasibility_state: confirmed
---

<!-- Stage 01 → see .claude/skills/interview/SKILL.md -->
<!-- Why: capture the idea before it's forgotten or retold incorrectly -->

# Idea Brief — Resource scheduling

Domain terms (**resource**, **allocation**, **capacity**, **project**) follow [`CONTEXT.md`](../../../CONTEXT.md).

## 1. Raw idea
It's difficult to plan and allocate resources within the team. It's unclear who is working on which projects and how busy they are. We need to set up a scheduling system so we can see and manage this.

## 2. Problem
PMs and team leads can't answer "who is free in the next 2 weeks?" without about an hour of chat back and forth. The plan lives in Google Sheets and Jira tickets, with no combined view per person, so nobody can see a resource's allocations against their capacity. Overbooking and bench time are only noticed after the fact.

## 3. Users
- **Planners (primary, ~5 people):** PMs / delivery managers who create allocations across projects, and team leads who are responsible for keeping their team neither overbooked nor idle. They plan weekly.
- **Scheduled resources (secondary, up to 30 employees):** their week is decided by the plan. In the MVP they view it but don't edit it.

## 4. Why now
Strategic, not incident-driven. Resource scheduling is part of building out the intranet, which is meant to join interconnected internal features (people, leave, projects) in one place instead of adding more bought tools linked by integrations.

## 5. Out of scope
- Time tracking: recording actual hours worked (logged time) and comparing plan to actual.
- Skills and search for people by skill.
- Finances: rates, project budgets, margin.
- Drag-and-drop day-level editing, scenarios and what-if planning.
- Jira sync. A project-list import may follow after launch (§15).

## 6. Competitive analysis
| # | Product · URL | Features | Value per feature (1-5) | Gap |
|---|---|---|---|---|
| 1 | Float · [capterra](https://www.capterra.com/p/136078/Float/pricing/) | Schedule; capacity & time off; margin | 5 · 4 · 2 | Separate copy of people and leave; $7–12/person/mo |
| 2 | Resource Guru · [tdpm](https://thedigitalprojectmanager.com/tools/runn-vs-resource-guru/) | Booking calendar; calendar sync | 4 · 3 | Simple, but another people list to maintain |
| 3 | Runn · [capterra](https://www.capterra.com/p/202595/Runn/pricing/) | Capacity planning; forecasting; financials | 5 · 4 · 2 | Finance depth we've ruled out of scope |
| 4 | Tempo Capacity Planner · [marketplace](https://marketplace.atlassian.com/apps/1211881) | Plan per Jira issue; capacity reports | 4 · 4 | Bench, training and leave don't exist in Jira |
| 5 | Teamdeck · [capterra](https://www.capterra.ie/software/158624/teamdeck) | Scheduling; timesheets; leave approval | 4 · 2 · 4 | Yet another place for the same people data |
| 6 | Status quo: Sheets + Jira | Free-form grid; ticket estimates | 2 · 2 | No capacity, no owner, goes stale |

Footnotes: researched 2026-10-27. Queries: (1) "Float resource scheduling software features pricing 2026"; (2–3) "Resource Guru vs Runn resource planning features pricing"; (4) "Tempo Planner Jira capacity planning team resource allocation"; (5) "Teamdeck resource scheduling leave management time tracking"; (6) interview. Prices are from aggregators; check vendor sites.

**Main gap:** none of these share one record of people, leave and projects with the rest of an intranet. Every option is one more copy of the employee list.

## 7. Strategic approaches

### Approach A — The Shared Allocation Board
- **Thesis:** One board with resources as rows and weeks as columns. Each cell is coloured free / partly booked / overbooked against capacity.
- **For whom:** PMs and team leads equally. No roles or approvals.
- **Outcome metric:** time to answer "who is free next 2 weeks?" ~60 min → <1 min. Spreadsheets archived by week 6.
- **Key trade-off:** weekly-only and no ownership, giving up precision and trust for speed.
- **Effort signal:** S (~2 person-weeks)
- **Recommended?** ◯

### Approach B — Availability as Intranet Fabric
- **Thesis:** A "Who's free?" box (date range + minimum hours → ranked resources), a weekly one-tap load check-in from every employee, and an availability badge reused across future intranet pages.
- **For whom:** PMs ask the question; team leads act on overload signals.
- **Outcome metric:** median time to answer "who is free?" ~60 min → ≤1 min.
- **Key trade-off:** effort goes into the answer box and check-in, so plan editing is plain at launch.
- **Effort signal:** M
- **Recommended?** ◯

### Approach C — Team Availability Board
- **Thesis:** A weekly board of resources by project with load against capacity, built on the intranet's first reusable record of people and projects.
- **For whom:** PMs edit across projects; team leads see and edit their own team.
- **Outcome metric:** time to answer "who is free next 2 weeks?" ~60 min → ≤1 min, using one filtered view.
- **Key trade-off:** weekly granularity and a colour-coded view ship; drag-and-drop, scenarios and what-if don't.
- **Effort signal:** M (~4 person-weeks; 5 with the additions in §13)
- **Recommended?** ●

## 8. Multi-perspective feedback

### Engineer
- A: no roles means silent overwrites; builds no reusable people record.
- B: couples to modules that don't exist yet; check-in can contradict the plan.
- C: right foundation, but keep the people record separate from scheduling. Team-scoped editing is the schedule risk. No spreadsheet import.
- A later Jira import needs project identity planned now.

### Executive
- A: fastest off the spreadsheets, but copies a $1.5–4k/yr product and leaves nothing behind.
- B: builds a platform before the first use case is proven.
- C: best fit. A shared people and project record is the real build-over-buy argument.

### UX-researcher
- A: familiar, but "who is free" still means scanning colours.
- B: weekly check-ins from 30 people fade; plain editing keeps PMs in the sheet.
- C: grid plus filter answers in a couple of clicks; needs a visible "last changed by".

### Synthesis matrix
|         | Engineer | Executive | UX |
|---------|:--------:|:---------:|:--:|
| App. A  | 0 Ships fast, but data model dead-ends | 0 Fast win, but no lasting foundation | 0 Familiar, but ownerless data decays fast |
| App. B  | - Speculative platform scope breaks deadline | - Speculative platform; adoption relies on check-ins | - Great question box, fragile human upkeep |
| App. C  | + Durable foundation; trim permissions to fit | + Solves goal, builds the reusable foundation | + Clear ownership keeps availability data trustworthy |

## 9. Trade-offs and edge cases

### Trade-offs per approach
| Approach | Pros | Cons |
|---|---|---|
| A | Ships in ~2 weeks; familiar grid; low risk to deadline | No ownership or audit; nothing reusable; rework once a people directory exists |
| B | Most direct answer to the goal question; employee load signal | Scope too big for a month; check-in fatigue; plan and check-in disagree |
| C | Reusable people and project record; clear data ownership; meets the goal | Uses the whole time budget; team-scoped editing adds rules |

### Edge cases
- **Partial adoption:** one planner keeps using the sheet, so people show as free when they aren't (double bookings, "the tool said she was free").
- **Allocation over a partial week:** a range that starts mid-week, or a week containing a public holiday, needs one agreed rule for "hours per week".
- **Overbooking:** blocked, warned or allowed? Needs a decision.
- **Leave entered twice:** if leave is approved elsewhere (email, HR) and also typed in as a leave allocation, it will be forgotten, and people on holiday get booked onto work.
- **Part-timers, joiners and leavers:** capacity must respect contract hours, start dates and leave dates, or the free view lies.
- **Closed projects:** they must stop accepting new allocations.
- **Leave visibility:** who can see why someone is away (especially sick leave)?
- **Edits by both a PM and a team lead** to the same resource's week need to be visible and traceable.

## 10. Risks
- **Top (devil's advocate): no people data to plan against.** The intranet has no employee directory yet. Contract hours, part-time patterns, start/leave dates and team membership must be loaded before any capacity number is right, and that work competes for the same month. *Signal:* part-timers or leavers show full capacity, and PMs stop trusting the view within a week.
- **Schedule:** E = 5 person-weeks for one developer working with Claude Code, against a ~5-week deadline (1 month + ~20% flexibility). No slack. If behind, simplify team-lead permissions first.
- **Adoption:** the answer is only right if every planner keeps every allocation current. The spreadsheet must actually be retired, not run alongside.
- **Build vs buy:** the in-house case rests on the intranet growing. Until it does, the team owns support, permissions, history and reports that a $4–12 per person tool already has.
- **Undefined rules** (partial weeks, overbooking, holiday calendars) cause "whose number is right" arguments.

## 11. RICE — Claude proposed
- **Reach (R)**: 30. Every scheduled employee is affected by the plan, not just the ~5 planners (§3).
- **Impact (I)**: 2 (high). Answering the core question drops from ~60 min to ~1 min (§2). Executive rates C "+" on strategic fit (§8). Not 3: Sheets and Jira partly work today.
- **Confidence (C)**: 0.7. Five open questions remain (§15): source of people data, Jira, edit rights, leave visibility, partial-week rules.
- **Effort (E)**: 5 person-weeks. C's M signal (~4, §7) plus 1 for loading people data and the spreadsheet import.
- **RICE = 30 × 2 × 0.7 / 5 = 8.4**
- **State**: confirmed
- *For comparison (Claude estimate, not confirmed):* A with I = 1 and E = 2 scores 10.5. C is not chosen on RICE alone; see §13.

## 12. Feasibility — Claude proposed

- [☑] **Tech**: the platform already has an accounts module (`identity`), a template for new modules and a design system. A people/departments module (`org`) is already planned in `ARCHITECTURE.md`. Expect two new modules (people, scheduling) and new links between modules, confirmed at architecture stage.
- [☑] **Skills**: the team built the intranet's foundation and accounts module. Caveat: no business feature has shipped yet, and the people × weeks grid will be the first complex screen.
- [☑] **Time**: one developer working with Claude Code. The deadline can flex ~20% (feature is not critical), so ~5 weeks covers E = 5 with no slack. There's no past feature to compare pace against, because the repo is 3 weeks old.
- **State**: confirmed

## 13. Recommendation
**Selected: Approach C — Team Availability Board**, with three additions from review: (1) a one-time import from the planning spreadsheet; (2) the record of people kept separate from scheduling, so later modules reuse it; (3) a visible "last changed by / when" on allocations.

C is the only approach every reviewer rated "+" (§8; Engineer: "durable foundation; trim permissions to fit"). It also closes the main market gap (§6): no bought tool shares one record of people, leave and projects with the rest of the intranet, which is the whole reason to build. Its RICE of 8.4 (§11) is lower than A's estimated 10.5, because A is cheaper. A was set aside because all three reviewers found its data model a dead end that would be reworked once a people directory exists. Feasibility is 3/3 ☑ (§12), with Time depending on the ~20% deadline flexibility. If the schedule slips, team-lead permissions get simplified to "all planners edit, changes are traceable".

**Locked-in pointer**: the PRD covers a weekly people × weeks board with load against capacity; a "free hours, next N weeks" filter; PM-wide and team-scoped editing; leave booked as a project; a holiday list; a people record separate from scheduling; a one-time spreadsheet import; and change history on allocations.

## 14. Parked & rejected approaches
| # | Approach | Status | Reason | Revisit trigger |
|---|---|:---:|---|---|
| A | The Shared Allocation Board | parked | No ownership or reusable record; rework once people data exists (§8 all 0) | Deadline becomes hard and C's scope can't be cut enough |
| B | Availability as Intranet Fabric | parked | Too big for a month; relies on 30 people checking in weekly (§8 all −) | 2+ other intranet modules need an availability signal |
| - | Buy a tool (Float / Runn / Resource Guru) | rejected | Adds one more copy of people data and integrations, against the intranet's purpose | In-house build misses the deadline by >50%, or the intranet roadmap stalls |
| - | Jira as source of projects | parked | Bench, training and leave don't exist there; sync adds failure modes | PMs report double entry of projects as a real cost after launch |

## 15. Open questions
- [ ] Where do people data (contract hours, part-time pattern, start/leave dates, team) come from, and who loads it before launch? — owner: PM, due: before PRD
- [ ] Jira: project-list import after launch, or never? How do we avoid duplicate projects? — owner: Tech Lead, due: PRD
- [ ] Edit rights: who can change whose allocations? Is team-scoped editing in the MVP or the first cut if behind? — owner: PM + Tech Lead, due: PRD
- [ ] Leave visibility: who sees leave, and is the reason (e.g. sick leave) hidden? — owner: PM, due: PRD
- [ ] Allocation rules: partial weeks, weeks with public holidays, overbooking blocked/warned/allowed, whose holiday calendar applies? — owner: PM, due: PRD
- [ ] Is the people record a new module of its own (`org`, already planned) — a hard-to-reverse choice for the architecture stage, not decided here. — owner: Tech Lead, due: architecture-design

## Related
- [`CONTEXT.md`](../../../CONTEXT.md) — glossary: allocation, capacity, project, resource
- [`ARCHITECTURE.md`](../../../ARCHITECTURE.md) — planned `org` module (people, departments)
- Ticket: —

## DoD self-check
- [x] 15 sections present
- [x] No anti-pattern terms (Postgres/Redis/etc.)
- [x] Length ≤ 5 pages (~2200 words)
- [x] Frontmatter status: Confirmed
- [x] RICE confirmed (state: confirmed)
- [x] Feasibility confirmed (state: confirmed)
- [x] Recommendation present with rationale citing 4 upstream sections (§6, §8, §11, §12)
