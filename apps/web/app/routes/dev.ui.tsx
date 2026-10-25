import type { CSSProperties } from 'react';
import { data, type MetaFunction } from 'react-router';
import { PROJECT_HUES } from '~/shared/lib/project-color';
import { Button } from '~/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/shared/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu';
import { Input } from '~/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table';

// No `./+types/dev.ui`: typegen runs with NODE_ENV=production, where this route is not registered.
export const meta: MetaFunction = () => [{ title: 'UI showcase · ARV Intranet' }];

// Registered only outside production (routes.ts); the guard covers a misconfigured build.
export function loader() {
  if (!import.meta.env.DEV) throw data(null, { status: 404 });
  return null;
}

const BUTTON_VARIANTS = [
  'default',
  'outline',
  'secondary',
  'ghost',
  'destructive',
  'link',
] as const;

const ROLES = [
  { value: 'engineer', label: 'Engineer' },
  { value: 'designer', label: 'Designer' },
  { value: 'manager', label: 'Project manager' },
];

const PEOPLE = [
  { name: 'Ann Novak', role: 'Engineer', hours: 32, capacity: 40 },
  { name: 'Bo Lindqvist', role: 'Designer', hours: 44.5, capacity: 40 },
  { name: 'Chidi Okafor', role: 'Project manager', hours: 7.5, capacity: 20 },
];

const hue = (h: number) => ({ '--project-hue': h }) as CSSProperties;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t py-6">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function DevUi() {
  return (
    <main className="flex flex-col">
      <header className="flex flex-col gap-1 pb-6">
        <h1 className="text-2xl font-semibold">UI showcase</h1>
        <p className="text-sm text-muted-foreground">
          Dev only. Switch theme with the toggle in the top bar.
        </p>
      </header>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
          <Button disabled>disabled</Button>
          <Button size="sm">small</Button>
        </div>
      </Section>

      <Section title="Inputs">
        <div className="grid max-w-md gap-2">
          <Input placeholder="Search people…" aria-label="Search people" />
          <Select items={ROLES} defaultValue="engineer">
            <SelectTrigger className="w-48" aria-label="Role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((role) => (
                <SelectItem key={role.value} value={role.value}>
                  {role.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Section>

      <Section title="Dropdown menu & dialog">
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>Actions</DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Edit assignment</DropdownMenuItem>
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog>
            <DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete assignment?</DialogTitle>
                <DialogDescription>This removes 3 days from the schedule.</DialogDescription>
              </DialogHeader>
              <DialogFooter showCloseButton>
                <Button variant="destructive">Delete</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </Section>

      <Section title="Table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead className="text-right">Utilization</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {PEOPLE.map((p) => {
              const utilization = Math.round((p.hours / p.capacity) * 100);
              return (
                <TableRow key={p.name}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.role}</TableCell>
                  <TableCell className="num text-right">{p.hours.toFixed(1)}</TableCell>
                  <TableCell
                    className={`num text-right ${utilization > 100 ? 'text-overload' : utilization < 50 ? 'text-underutilized' : ''}`}
                  >
                    {utilization}%
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Section>

      <Section title="Project colors">
        <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
          {PROJECT_HUES.map((h) => (
            <div key={h} className="contents">
              <div className="flex h-timeline-row items-center gap-1 py-1">
                <div
                  className="project-block flex h-full flex-1 items-center justify-between px-2 text-xs font-medium"
                  style={hue(h)}
                >
                  <span className="truncate">Project hue {h}</span>
                  <span className="num">6h/d</span>
                </div>
                <div
                  className="project-block h-full w-3"
                  style={hue(h)}
                  title={`Project hue ${h} · 2h/d`}
                />
              </div>
              <span className="num self-center text-xs text-muted-foreground">{h}°</span>
            </div>
          ))}
        </div>
        <div className="flex h-timeline-row-compact items-center gap-1">
          <div
            className="project-block flex h-full flex-1 items-center px-2 text-xs font-medium"
            style={hue(PROJECT_HUES[10])}
          >
            Compact row
          </div>
        </div>
      </Section>

      <Section title="Status">
        <div className="grid grid-cols-5 border-l">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, i) => (
            <div key={day} className="flex flex-col border-r border-b">
              <div className="flex h-6 items-center justify-between px-2 text-xs text-muted-foreground">
                <span>{day}</span>
                {i === 2 && <span className="h-1 w-6 rounded-sm bg-overload" title="Overloaded" />}
                {i === 1 && (
                  <span className="h-1 w-6 rounded-sm bg-underutilized" title="Underutilized" />
                )}
              </div>
              <div
                className={`flex h-timeline-row items-center px-2 text-xs ${i === 4 ? 'time-off-hatch' : ''}`}
              >
                {i === 4 ? 'Time off' : <span className="num">{i === 2 ? '10h' : '8h'}</span>}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type">
        <div className="flex flex-col gap-1">
          <p className="text-2xl font-semibold">Heading 24 / 600</p>
          <p className="text-xl font-semibold">Heading 20 / 600</p>
          <p className="text-base font-medium">Label 16 / 500</p>
          <p className="text-sm">Body 14 / 400</p>
          <p className="text-xs text-muted-foreground">Caption 12 / 400</p>
          <p className="num text-sm">0123456789 · 7.5h · 112% · 2026-10-25</p>
        </div>
      </Section>
    </main>
  );
}
