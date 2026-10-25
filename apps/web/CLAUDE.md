## Frontend Aesthetics

This is an internal resource-planning tool that people keep open all day. The visual direction is fixed: Vercel/Geist for the frame (navigation, forms, tables, settings) and Float for the content (the schedule timeline). Consistency beats novelty: never invent a new look for a screen. Every UI decision must come from the design tokens and components in app/shared/ui.

### Typography

- Geist Sans for all UI text, Geist Mono for numbers: hours, percentages, dates in tables and on the timeline. Always use tabular-nums for numbers.
- Type scale: 12 / 13 / 14 / 16 / 20 / 24px. Body text is 14px.
- Weights: 400 (text), 500 (labels, buttons), 600 (headings). Nothing else.
- Do not add other font families.

### Color &amp; theme

- Use only CSS variables / semantic tokens from app/app.css (e.g. bg-surface, text-muted, border-default). Never use raw hex values or Tailwind palette classes like bg-blue-500 in app code.
- Base is a 12-step neutral gray scale. A single accent color is reserved for primary actions and focus states.
- Status colors are separate from project colors and mean only one thing: overload = red, underutilized = amber, time off = gray diagonal hatch.
- Every screen must work in both light and dark themes. Check both.

### Surfaces &amp; depth

- Solid backgrounds. Separate areas with 1px borders, not shadows.
- Shadows are only for floating layers: popovers, menus, dialogs, drag previews.
- Radius: 6px for controls, 8px for cards and dialogs, 4px for timeline blocks.
- No gradients, glassmorphism, blurred blobs or decorative backgrounds.

### Timeline (core screen)

- Assignment block: tinted fill of the project color, a 3px left stripe in the full color, text in a darker shade of the same hue. Long blocks show project name + hours/day; short blocks degrade gracefully to a stripe + tooltip.
- Person row: avatar, name, role, and a small capacity indicator for the visible range.
- Overload: red marker above the overloaded day. Time off: diagonal hatch. Today: thin vertical accent line.
- Row height 44px (comfortable) / 32px (compact). Sticky date header and sticky people column.

### Motion

- Motion is functional only: drag feedback, opening popovers, reordering.
- 100–200ms, ease-out. No staggered page-load reveals, no decorative animation.
- Respect prefers-reduced-motion.

### Layout &amp; density

- 4px spacing grid. Work screens are dense and left-aligned, not centered.
- Right-align numbers in tables.
- Empty states: one short sentence and one primary action.

### Components

- Build from app/shared/ui (shadcn/ui base; React Aria for date pickers, calendars and drag-and-drop). Check for an existing component before creating a new one; extend through variants (cva), not oneoff styles.
- Icons: lucide-react only, 16px in dense UI, 20px max elsewhere.

### Avoid (common generic defaults)

- Purple/indigo gradients and "AI startup" landing-page styling.
- Dashboards made of big stat cards with oversized numbers and emoji.
- Large radii (rounded-2xl and up), heavy or colored shadows.
- Inter, Roboto or system font stacks instead of Geist.
- Mixing spacing values outside the 4px grid; ad-hoc colors.

### References

- Vercel dashboard and the Geist design system: tables, forms, settings, navigation.
- Float Schedule (people and project views): timeline blocks, capacity, time off.
- Linear: keyboard-first interactions and command palette.

### Process

- Before UI work, briefly state which tokens and components you will use.
- After UI work, verify: light + dark theme, keyboard focus states, and layout at 1280px and 1920px widths.