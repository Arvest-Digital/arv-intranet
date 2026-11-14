# Design ↔ docs gap analysis — resource-scheduling (2026-11-14)

Design: Claude Design canvas «Schedule — by people» (14 artboards; по сути 2 экрана — *By people* и *By project* — в вариантах light/dark × week/month + New assignment dialog + Empty + No results).
Docs: [PRD](../PRD.md), [SAD](../sad.md), [ADR-0002](../adr/0002-render-board-ssr-with-week-window-in-url.md), [openapi](../contracts/openapi.yaml), web-таски T36–T44.

## 1. Что в дизайне есть и совпадает с доками (оставить)

- App shell, переключатель темы, light/dark на shadcn-токенах ARV Intranet DS.
- Паттерн фильтров-поповеров с поиском, «Clear», счётчиком; empty state «No results → Clear filters».
- Маркер «Today», индикаторы перегрузки в заголовке и в строке.
- Превью доступности прямо в диалоге создания + предупреждение о перегрузке до сохранения (концепция AC-10 — верная).
- Поповер деталей аллокации (даты, ставка, итог) с действиями.

## 2. Конфликты (дизайн противоречит докам)

| # | В дизайне | В доках | Источник |
|---|---|---|---|
| C1 | Дневной Gantt: «Week» = 4 недели × 28 дневных колонок, аллокации — плашки по дням | Недельная доска: 1 колонка = ISO-неделя, по умолчанию текущая + 11 (12 недель); ячейка = «allocated/capacity» + ровно одно состояние | AC-01, ADR-0002, `BoardCell` |
| C2 | Drag-and-drop плашек (`showDrag`, ghost с датами) | Drag-and-drop day-level editing — **non-goal** | PRD §3, idea-brief |
| C3 | Placeholder / open role («Frontend developer · Unassigned», кнопка Assign, легенда, «1 open role») | Аллокация всегда на employee record; open roles в домене нет | AC-07, `AllocationCreate.employeeId` required |
| C4 | Фильтры Department и Role; в строке «Backend developer · Engineering» | Есть только **team** (опциональная, «no team») и project; поля role/job title нет | AC-02, AC-06, `EmployeeRef` |
| C5 | Ёмкость захардкожена 8h/день; перегрузка считается по дням («d over», «12h / 8h» по датам) | Capacity = contract hours / working days, минус public holidays, в пределах employment period; overbooking судится **по неделям** (список недель + часы сверх); по дням — только конфликт работы с днями отпуска | AC-08, AC-10, AC-15, AC-19, AC-27 |
| C6 | Hours per day — только чипы 2/4/6/8h | Ставка **в день или в неделю**, кратна 15 мин, ≤ 24/день; правила валидации | AC-07, AC-09, `rateMinutes`/`ratePeriod` |
| C7 | «Book time for a person or an open role» | См. C3 | — |
| C8 | Поле Note в диалоге | В контракте нет | `AllocationCreate` |
| C9 | Действия Edit / **Duplicate** / **Delete** | Duplicate нет; «Remove» действует **с сегодняшнего дня** (прошлое остаётся, outcome `ended` vs `deleted`) | AC-07a, AC-09b, `AllocationRemoval` |
| C10 | «Time off» — серая полоса без типа | Отпуск = аллокация на leave-type project, занимает полную дневную ёмкость; показывается «away · N days»; тип виден только с `see-leave-reasons` или самому ресурсу | AC-01, AC-15, AC-29 |
| C11 | Date picker с произвольным диапазоном по дням и пресетами «This month / Next month» | Окно = `from` (понедельник) + `weeks` ≤ 12; назад ≤ 12 мес (только просмотр), вперёд ≤ 52 нед | ADR-0002, AC-01 |
| C12 | Отдельный вид «By project» (группы проектов с участниками), дневной, отпуск не учтён | В доках только **фильтр** по проекту; вид не запрещён, но не описан. Leave-проекты не показываются без `see-leave-reasons`. Данные уже есть в `Board` (`BoardAllocation.project` + `minutesPerWeek`) — контракт менять не нужно, группировка на web | AC-02, AC-29, `BoardRow` |
| C13 | Utilization % за видимый период в каждой строке | Не описано; для incomplete record ёмкость неизвестна (capacity `null`) — % посчитать нельзя | AC-06 |
| C14 | Цвет — основной носитель статуса (красный overload, оттенки проектов) | Каждое состояние: текстовая метка + иконка, не только цвет; контраст ≥ 4.5:1 | PRD §6, SAD §8 Accessibility, T39/T44 |
| C15 | Nav: Schedule / People / Projects / **Reports** | Reports нет; нет пунктов Free list, My schedule, Teams, Holidays, Import | PRD US-02/06/07/09/11 |
| C16 | Кнопки редактирования видны всем | Видимость действий зависит от 6 permissions; view-only зритель не видит New/Edit | AC-12, AC-12b, SAD §8 |

## 3. Не покрыто дизайном

**Доска (US-01, T39)**
- 6 состояний ячейки: free · partly booked (вкл. «40/40») · overbooked · non-working · incomplete record · needs attention; плюс «away · N days».
- Строка incomplete record (нет contract hours / start date) с пометкой «capacity unknown»; группа «No team».
- Needs attention: аллокации после employment end (видно только `manage-employee-records`/`edit-allocations`), недели после end date.
- Прошлые недели — read-only; границы навигации (−12 мес / +52 нед); отображение часов с округлением до 0.5h («37.5h»).
- Плотность: 100 ресурсов × 12 недель; группировка по team.
- AC-03: нет прав → «нельзя смотреть доску» + ссылка на My schedule.

**Who's free (US-02, T40)** — экрана нет вообще: форма N недель (1–12) + min free hours, ранжированный список с free hours по неделям, блок «left out — capacity unknown», ошибка AC-05, пустой результат.

**Диалог аллокации (US-03, T41)**
- Режим Edit: версия, «changes apply from today», заблокированная дата начала если в прошлом, last changed by/at.
- Ошибки по полям (AC-09), вне employment period с последней допустимой датой (AC-13), closed project (AC-11), прошлое не переписываем (AC-09b).
- Overbooking confirm со списком недель и часами сверх (AC-10) → «Save anyway».
- Conflict (AC-07b): «изменено пользователем X в HH:MM», текущие значения vs ваши.
- Remove confirm: «закончится вчера» (ended) vs «будет удалена» (deleted).
- Выбор проекта: только open, сгруппировано по типу (client/internal/bench/training); выбор ресурса.

**Leave (US-04, T42)** — диалог отпуска: тип = leave-project, только целые рабочие дни, confirm со списком рабочих аллокаций на днях отпуска (AC-15).

**History (US-05, T42)** — панель истории: created / imported / changed / trimmed / removed, кто, когда, effective from, before → after; «away» при редакции; trim от закрытия проекта.

**My schedule (US-06, T40)** — read-only недели своего плана со своим типом отпуска; состояние «not set up as a resource» (AC-18).

**Employee records & teams (US-07, T36/T37)** — список (incomplete, linked login), форма (name, team, contract hours, working days, start/end, link login), ошибки AC-20, «login already linked to …» (AC-19b), capacity-impact confirm (AC-19c), conflict по версии; teams: create/rename/remove, team lead, duplicate name, «remove refused: N resources».

**Projects (US-08, T38)** — список по типу/статусу, create с типом, duplicate name (AC-24), close: дата → превью trimmed/removed → confirm (AC-25), closed badge.

**Holidays (US-09, T37)** — единый список, add/remove, impact confirm (AC-27/AC-19c).

**Import (US-11, T43)** — upload → preview (counts, incomplete, overbooked resource-weeks) или problem rows → confirm (re-upload); already imported; missing permissions.

**Сквозные** — Forbidden с названием permission; read-only вариант для viewer; редакция leave type («away») рядом с полной версией; toast успеха; pending-навигация (SSR).

## 4. Решения, принятые в промптах по умолчанию (поменяйте, если не согласны)

1. **Сетка недельная**, ячейка с цифрами — главная. Аллокации — раскрываемые под-строки ресурса с недельными цифрами по проекту (не дневные плашки). Gantt/drag — убираем.
2. **By project** — оставляем как второй вид доски (Prompt 1b): та же недельная сетка, группировка по проекту на web из данных `GET /scheduling/board`, отпуск — по типам или единой группой «Away» в зависимости от `see-leave-reasons`. **Доки обновлены 2026-11-14:** PRD US-01 + новый AC-02b, SAD §4 (параметр `view`) и покрытие §6, T39 (`tasks/t39-web-board.md`, `tasks.json`).
3. **Placeholders / open roles, Note, Duplicate, Department/Role, Reports** — убираем. Если нужны — сначала изменение PRD/контракта, потом дизайн.
4. Utilization % — оставляем как вторичный индикатор за окно, с «—» для incomplete record.

---

## 5. Промпты для Claude Design (V2 на новой странице)

Отправлять по одному, по порядку. Промпт 0 задаёт контекст и правила; каждый следующий добавляет группу артбордов. Все — только light (dark-варианты отдельным последним промптом, когда light согласован).

### Prompt 0 — контекст и правила V2

```
Create a new page named "V2" on this canvas. Do not modify or move any artboard on the existing page — V1 stays as is for comparison. Everything below goes on page V2 only, using the installed ARV Intranet design system (same tokens, type, radii, shadcn-style components as V1). Light theme only for now.

V2 aligns the design with the approved PRD for "resource scheduling". Product rules every artboard must follow:

GRANULARITY & WINDOW
- The board is WEEKLY. One column = one ISO week (Mon–Sun). Default window = the current week + 11 following (12 columns). The user can page back up to 12 months (view only) and forward up to 52 weeks. Navigation moves the window by weeks; the date picker picks a start week and a number of weeks (1–12), not arbitrary days. Presets: "This week", "Next 4 weeks", "Next 12 weeks".
- No day columns, no Gantt bars, no drag-and-drop anywhere.

DOMAIN
- Resource = an employee record: full name, team (optional — resources without one are grouped under "No team"), weekly contract hours, working days (default Mon–Fri), employment start/end. There is NO job title, role or department field — show the team only.
- Capacity per week = contract hours spread over the resource's working days, minus public holidays, zero outside the employment period. Part-timers exist (e.g. 24h Mon–Wed = 8h/day).
- Allocation = resource + open project + date range + rate (hours per DAY or per WEEK, multiples of 0.25h, max 24h/day). Leave is an allocation to a leave-type project ("Annual leave", "Sick leave"), booked in whole working days, taking the full daily capacity.
- Project types: client, internal, bench, training, leave. Projects can be closed (no further changes).
- Hours are shown rounded to the nearest 0.5h ("37.5h").

CELL STATES (exactly one per resource-week cell, each with a TEXT label + lucide icon, never colour alone; text contrast ≥ 4.5:1)
- Free — nothing allocated, capacity > 0 → "0/40"
- Partly booked — allocated > 0 and ≤ capacity → "24/40", a full week shows "40/40"
- Overbooked — allocated > capacity → "48/40" + "+8h over"
- Non-working — capacity 0 and nothing allocated (e.g. before start date) → "—"
- Incomplete record — capacity unknown → "?" + "Capacity unknown"
- Needs attention — allocation runs past the employment end date
- A week with leave additionally shows "Away · 3d" next to the hours.

PERMISSIONS (six, decide what is visible): view whole board, edit allocations (includes view), manage employee records, manage projects, manage holiday list, see leave reasons. Viewers without see-leave-reasons see leave only as "Away" (no type, no leave project name, leave projects absent from the project filter); a resource always sees their own leave type. Employment end dates and needs-attention marks are visible only to holders of manage-employee-records or edit-allocations. Users without edit-allocations see no create/edit/remove controls.

NAVIGATION (app shell): Schedule · Who's free · My schedule · People (employee records, teams) · Projects · Holidays. Import appears only as an admin entry under People until the one-time import is done. No "Reports".

SAMPLE DATA (use consistently across all artboards; dates around today = Wed 2026-11-18, company time zone Europe/Kyiv):
- Olena Kovalenko · Platform · 40h Mon–Fri · Atlas CRM 24h/wk + Cobalt billing 24h/wk in W48 → overbooked +8h
- Marko Ivanov · Platform · 40h · Delta portal 8h/day → 40/40
- Sofia Lys · Design · 40h · Annual leave Mon–Wed of W49 → "Away · 3d"
- Iryna Bondar · QA · 24h Mon–Wed (part-timer) · Atlas 16h/wk
- Taras Hnatiuk · Platform · employment ends 2026-12-15, Ember analytics allocation runs to 2026-12-31 → needs attention after W51
- Yurii Petrenko · no team · 40h · free for most weeks
- Kateryna Shevchuk · Design · no contract hours yet → incomplete record
- Public holiday: Fri 2026-12-25 → that week's capacity is 32h for Mon–Fri people
- Projects: Atlas CRM, Beacon mobile, Cobalt billing, Delta portal, Ember analytics (client); Bench, Training (internal types); Annual leave, Sick leave (leave)

Acknowledge with a short list of the artboards you plan for V2 grouped by flow, then wait for the next prompt before drawing.
```

### Prompt 1 — Schedule board

```
On page V2, design the Schedule board (PAGE, 1440 wide), as a planner who holds edit allocations + see leave reasons. Artboards:

1. "Board · default" — toolbar: view switch "By people | By project" (By people active; By project is designed in the next prompt), window navigation (‹ Today ›), window label "W47 2026 – W5 2027", week-based picker, filters Team and Project (multi-select popovers like V1), search people, "New allocation" and "Book leave" buttons. Grid: sticky left column with resource name + team, 12 week columns (header "W48" + "23 Nov"), current week highlighted, past weeks visually read-only. Rows grouped by team (Platform, Design, QA, No team) with collapsible group headers showing group totals. Each cell renders its state per the rules (label + icon + "allocated/capacity"). A compact legend explains all 6 states and "Away".
2. "Board · row expanded" — Olena's row expanded: under the resource row, one sub-row per allocation (project name with type chip, weekly hours per column, "last changed by Marko · 2h ago" on hover). Clicking a sub-row cell opens an allocation detail popover: project, dates, rate ("24h / week"), total, last changed by/at, buttons Edit, History, Remove (no Duplicate).
3. "Board · special rows" — focus on the edge cases: Kateryna (incomplete record: every cell "?" with "Capacity unknown" and a row note "Add contract hours to see availability"), Taras (needs attention after his end date 15 Dec: end-date marker in the row, cells after it in the needs-attention state with tooltip "Allocation runs past employment end (15 Dec 2026)"), the holiday week showing 32h capacity with a holiday marker in the column header, Sofia's "Away · 3d".
4. "Board · read-only viewer" — same board for a user with view whole board only and WITHOUT see leave reasons: no New/Book/Edit controls, leave shows only "Away", no leave projects in the Project filter, Taras shows zero capacity after his end date with no needs-attention mark and no allocations after it.
5. "Board · no access" — user without board permissions: empty state "You don't have permission to view the team schedule" + primary link "Open my schedule".
6. Empty/no-results states adapted from V1 (copy: "No allocations in these 12 weeks.", "No people match these filters." + Clear filters).

Make sure the grid works for ~100 resources (compact density) and at phone width the grid scrolls horizontally inside its box with the name column sticky.
```

### Prompt 1b — Schedule board · by project

```
On page V2, design the "By project" view of the same Schedule board. It is the same data and the same 12-week window as By people, only grouped by project; same toolbar (view switch with By project active, window navigation, week picker, Team and Project filters, search, New allocation / Book leave). Weekly columns only — no day columns, no bars, no drag. Artboards:

1. "Board by project · default" — as a planner with edit allocations + see leave reasons. One collapsible group per project, ordered by type (client, internal, bench, training, then leave). Group header: project name, type chip, number of people, and per-week project totals ("64h") in each week column. Under it, one row per person on that project: name + team, their hours on this project per week, and in small secondary text the person's whole-week state for that week (state icon + "48/40") so overbooking caused by other projects is still visible. Clicking a person-week cell opens the same allocation detail popover as in By people (Edit, History, Remove). Leave groups ("Annual leave", "Sick leave") show leave as "Away · 3d" per week instead of hours-as-work.
2. "Board by project · closed project" — Atlas CRM with close date 15 Dec: "Closes 15 Dec" badge in the group header, weeks after the close date shaded as unavailable with no hours, and a "Closed" badge state variant for a project that is already closed (shown when it still has hours inside the window; no edit controls on its rows).
3. "Board by project · read-only viewer" — user with view whole board only and WITHOUT see leave reasons: no create/edit controls; leave-type groups are replaced by a single group "Away" with no type names and no breakdown by leave type; the Project filter lists no leave projects. Taras shows no hours on Ember analytics after his employment end date and no needs-attention mark.
4. "Board by project · filtered" — Project filter = Atlas CRM + Delta portal: only those two groups, the footer shows "2 projects · 5 people".
5. "Board by project · empty" — "No allocations in these 12 weeks." (same empty state style as By people).

Keep the same cell-state labels, icons and contrast rules as By people. Group totals must not include leave hours.
```

### Prompt 2 — Allocation dialog (create / edit / remove)

```
On page V2, design the allocation dialog flow over the board (modal, shadcn dialog). Artboards:

1. "Allocation · create" — fields: Resource (searchable select showing name + team), Project (searchable select, OPEN projects only, grouped by type: client / internal / bench / training; leave projects are not here), Start and End dates (date pickers; start cannot be before today), Rate: numeric input in 0.25h steps + segmented control "per day | per week". Below: a weekly availability preview for the chosen resource across the selected range — one bar per WEEK showing booked hours, this allocation, and capacity line; a summary "6 weeks · 144h total". No Note field. Buttons Cancel / Create allocation.
2. "Allocation · validation errors" — inline per-field errors: "End date is before start date", "Hours must be a multiple of 0.25", "More than 24h per day", and the employment-period error under the dates: "Taras can be allocated up to 15 Dec 2026 — the range ends after his employment period."
3. "Allocation · overbooking confirm" — after submit, the dialog switches to a warning step: "Olena will be overbooked in 2 weeks" with a table Week · Capacity · Allocated · Over (W48 40h · 48h · +8h; W49 40h · 44h · +4h). Buttons "Back to edit" / "Save anyway".
4. "Allocation · edit" — editing an allocation that started in the past: info banner "Changes apply from today (18 Nov). Earlier weeks keep 20h/week.", start date read-only, last changed by/at line, version is implicit. Buttons Cancel / Save changes.
5. "Allocation · conflict" — save refused: "Marko changed this allocation at 14:32 while you were editing." Two-column comparison Their version vs Your changes, actions "Use current values" / "Re-apply my changes".
6. "Allocation · closed project / past" — error banners: "Cobalt billing is closed and accepts no new, changed or removed allocations." and "Past plans are not rewritten — choose a start date from today."
7. "Allocation · remove confirm" — two variants side by side: started in the past → "The allocation will end yesterday (17 Nov). Hours before today stay booked." / starts today or later → "The allocation will be deleted." Both mention it stays in history.
```

### Prompt 3 — Leave and history

```
On page V2, design:

1. "Leave · book" — dialog: Resource, Leave type (select of leave-type projects: Annual leave, Sick leave), Start / End date, computed "3 working days · 24h" (whole working days only, no hours input; holidays and non-working days skipped and listed). Buttons Cancel / Book leave.
2. "Leave · conflict confirm" — warning step: "Sofia has work planned on her leave days" listing each work allocation and its overlapping days (Beacon mobile — Mon 30 Nov, Tue 1 Dec), plus any overbooked weeks; hint "Shorten or move these allocations, or confirm to book anyway". Buttons Back / Book anyway.
3. "History · panel" — right-side sheet opened from an allocation: header with project + resource; timeline of entries newest first, each with kind badge (Created, Imported, Changed, Trimmed, Removed), who, when, "effective from 18 Nov", and a before → after diff of segments ("1 Oct–30 Nov · 20h/wk" → "18 Nov–30 Nov · 10h/wk"). Include a Trimmed entry "Trimmed when Atlas CRM was closed by Andrii" and the first entry "Imported by Andrii". Footer note: "History covers the last 12 months."
4. "History · redacted" — same panel for a viewer without see leave reasons looking at a sick-leave allocation: title shows "Away", no project or leave type anywhere.
```

### Prompt 4 — Who's free and My schedule

```
On page V2, design:

1. "Who's free · results" — page with a compact query form: "At least [16] free hours over the next [2] weeks" (weeks 1–12, hours ≥ 0) + Search. Note under the form: "Counts from today (Wed 18 Nov) to the end of week 48." Results table sorted most free first: resource, team, total free hours, free hours per week columns (overbooked weeks count as 0, shown as "0 · overbooked"), action "Allocate" (opens the allocation dialog prefilled; hidden for view-only users). Below: "Left out — capacity unknown: Kateryna Shevchuk" with link to the employee record.
2. "Who's free · invalid input" — no results; inline message "Weeks must be from 1 to 12 and free hours must be zero or more."
3. "Who's free · nobody" — empty state "Nobody has 40 free hours in the next 2 weeks." with suggestion to lower hours or widen weeks.
4. "My schedule" — read-only page for a resource (Sofia): 12 weekly cells with the same states and figures as the board, list of her allocations below with project, dates, rate; her own leave shows its type "Annual leave". No edit controls.
5. "My schedule · not set up" — empty state "You're not set up as a resource yet. Someone who manages employee records can link your login."
```

### Prompt 5 — People: employee records and teams

```
On page V2, design the People area (admin, manage employee records):

1. "People · list" — table: name, team, contract hours, working days (Mon–Fri chips), employment period, linked login (or "Not linked"), status badge "Incomplete" when contract hours or start date are missing. Filters by team and "Incomplete only". Button "New employee record". Secondary tab "Teams".
2. "Employee record · form" — create/edit: full name, team (select, optional), contract hours per week (0–60), working days (7 toggle chips, at least one), employment start, employment end (optional), linked intranet login (searchable select). Show derived capacity "8h per working day · 40h per full week". Inline errors per rule: "Contract hours must be more than 0 and at most 60", "Select at least one working day", "End date is before start date".
3. "Employee record · login already linked" — error under the login field: "This login is already linked to Marko Ivanov."
4. "Employee record · capacity impact confirm" — after lowering contract hours 40→24: "These weeks will become overbooked" table Resource · Week · Over; note "Allocations are not changed." Buttons Back / Save anyway.
5. "Employee record · end date warning" — after setting an end date before existing allocations end: success toast + note "2 allocations run past 15 Dec and are marked as needing attention on the board."
6. "Teams" — list with team name, team lead, number of resources; create/rename inline; errors "A team named "Platform" already exists" and "Can't remove Design — 3 resources are still in it."
```

### Prompt 6 — Projects and holidays

```
On page V2, design:

1. "Projects · list" — table grouped or filterable by type (client, internal, bench, training, leave) and status (Open / Closed, closed shows the close date), button "New project".
2. "Project · create" — dialog: name, type. Error: "An open project named "Atlas" already exists." (names compared ignoring case and spaces).
3. "Project · close" — dialog: close date (last bookable day, today or later; earlier dates refused with message "Close date can't be in the past"). Preview step: "3 allocations will end on 15 Dec" (resource, current dates → new end) and "1 allocation starting after 15 Dec will be removed"; note "Changes are recorded in each allocation's history under your name." Buttons Back / Close project.
4. "Holidays · list" — the single company holiday list by year: date, name, remove; "Add holiday" with date + name.
5. "Holiday · impact confirm" — adding 25 Dec makes weeks overbooked: table Resource · Week · Over, "Allocations are not changed." Back / Add anyway.
Add a generic "Forbidden" variant used on these pages: "You don't have the "manage projects" permission." (names the missing permission).
```

### Prompt 7 — One-time import

```
On page V2, design the one-time spreadsheet import (needs edit allocations + manage employee records + manage projects):

1. "Import · upload" — explanation that the import runs once and seeds the board from the planning spreadsheet; file drop zone; button "Preview".
2. "Import · preview OK" — summary cards: employee records to create, still incomplete after import, projects to create, allocations to create; table of resource-weeks that will be overbooked (allowed, shown for information); one primary button "Import everything" (re-uploads the same file); note "Nothing is saved until you confirm."
3. "Import · problem rows" — nothing imported; table Row · Column · Problem ("Empty hours", "End date before start date", "Looks like the same person as row 12: "O. Kovalenko" / "Olena Kovalenko""); CTA "Fix the spreadsheet and upload again".
4. "Import · already done" — "The import has already been completed on 2 Dec by Andrii. Make further changes on the board."
5. "Import · missing permissions" — "You need these permissions to import: manage projects."
```

### Prompt 8 — Dark theme (после согласования light)

```
On page V2, add dark-theme duplicates of these artboards only: Board · default, Board · special rows, Board by project · default, Allocation · create, Allocation · overbooking confirm, History · panel, Who's free · results. Place each dark artboard directly below its light original. Check that every cell state label and icon keeps ≥ 4.5:1 contrast in dark.
```
