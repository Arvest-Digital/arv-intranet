## Frontend Aesthetics

This is an internal resource-planning tool that people keep open all day. The visual direction is fixed: Vercel/Geist for the frame (navigation, forms, tables, settings) and Float for the content (the schedule timeline). Consistency beats novelty: never invent a new look for a screen. Every UI decision must come from the design tokens in `app/app.css` (the single source of truth for tokens) and the components in `app/shared/ui`. Live reference of every token and component: `/dev/ui` (dev server only, `app/routes/dev.ui.tsx`).

### Typography

- Geist Sans for all UI text (`font-sans`, the default), Geist Mono for numbers: hours, percentages, dates in tables and on the timeline. Use the `num` utility for every number (`font-mono` + `tabular-nums`): `<TableCell className="num text-right">`.
- Type scale: 12 / 13 / 14 / 16 / 20 / 24px. Body text is 14px.
- Weights: 400 (text), 500 (labels, buttons), 600 (headings). Nothing else.
- Do not add other font families.

### Color & theme

- Use only the semantic tokens from `app/app.css`. Never use raw hex/oklch values or Tailwind palette classes like `bg-blue-500` in app code, and no `dark:` color overrides (tokens already switch).
  - Surfaces: `bg-background` (page), `bg-card`, `bg-popover`, `bg-muted` (subtle fill).
  - Text: `text-foreground`, `text-muted-foreground` (secondary text).
  - Borders: `border` / `border-border` (default), `border-input` (form controls), focus: `ring-ring`.
  - Interactive: `bg-primary text-primary-foreground`, `bg-secondary`, `bg-accent` (hover/selected rows and menu items), `text-destructive`.
- Base palette is shadcn "neutral" (pure grays, no tint). Primary is monochrome, Vercel-style: near-black in light, near-white in dark. There is no colored brand accent; project colors are the only hue in the UI.
- Status colors are separate from project colors and mean only one thing: overload = red (`bg-overload`, `text-overload`), underutilized = amber (`bg-underutilized`, `text-underutilized`), time off = gray diagonal hatch (`time-off-hatch` utility; `--time-off` is the stripe color). Each has a `-foreground` pair for text on a filled background. Don't use `destructive` for overload or vice versa.
- Theme: light / dark / system (default), stored in the `theme` cookie and applied as `.dark` on `<html>` on the server; see `app/shared/theme/`. Toggle: `ThemeToggle`.
- Every screen must work in both light and dark themes. Check both.

### Surfaces & depth

- Solid backgrounds. Separate areas with 1px borders, not shadows.
- Shadows are only for floating layers: popovers, menus, dialogs, drag previews.
- Radius (`--radius: 0.5rem`): `rounded-md` 6px for controls, `rounded-lg` 8px for cards, popovers and dialogs, `rounded-sm` 4px for timeline blocks and menu items.
- No gradients, glassmorphism, blurred blobs or decorative backgrounds.

### Timeline (core screen)

- Assignment block: `.project-block` with the project's hue set inline: `style={projectColorStyle(project.id)}` (`app/shared/lib/project-color.ts`). It gives the tinted fill, 3px left stripe and same-hue text; lightness/chroma come from `--project-{bg,edge,fg}-{l,c}` per theme (WCAG AA checked for every hue). Never pick project colors by hand; the hue list excludes red, which is reserved for overload. Long blocks show project name + hours/day; short blocks degrade gracefully to a stripe + tooltip.
- Person row: avatar, name, role, and a small capacity indicator for the visible range.
- Overload: red marker above the overloaded day. Time off: diagonal hatch. Today: thin vertical `bg-primary` line (shadcn `accent` is a gray hover fill, not a highlight color).
- Row height `h-timeline-row` 44px (comfortable) / `h-timeline-row-compact` 32px (compact). Sticky date header and sticky people column.

### Motion

- Motion is functional only: drag feedback, opening popovers, reordering.
- 100–200ms, ease-out. No staggered page-load reveals, no decorative animation.
- Respect prefers-reduced-motion.

### Layout & density

- 4px spacing grid. Work screens are dense and left-aligned, not centered.
- Right-align numbers in tables.
- Empty states: one short sentence and one primary action.

### Components

- Build from `app/shared/ui` (shadcn/ui on Base UI, added with `pnpm ui:add <component>`; after adding, replace any `rounded-2xl`+ classes with the radii above; React Aria for date pickers, calendars and drag-and-drop). Check for an existing component before creating a new one; extend through variants (cva), not oneoff styles.
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