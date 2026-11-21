import type { Me } from '@arv/contracts/identity';
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink } from 'react-router';
import { AccountMenu } from '~/features/identity/components/account-menu';
import { cn } from '~/shared/lib/utils';
import { type Section, visibleItems } from '~/shared/nav/section';
import { Button } from '~/shared/ui/button';
import type { SidebarState } from './sidebar';

const MOTION = 'duration-150 ease-out motion-reduce:transition-none';

/**
 * The section's side navigation (V2). Expanded it is a 232px panel; collapsed, a 56px rail of
 * icons that opens over the page on hover or keyboard focus (`:focus-visible`, so a click on
 * «Collapse» doesn't hold it open). Phones always get the rail, which
 * its own button opens over the page. Labels stay in the DOM, so every link keeps its name.
 */
export function AppSidebar({
  me,
  section,
  state,
  onStateChange,
}: {
  me: Me;
  section: Section;
  state: SidebarState;
  onStateChange: (state: SidebarState) => void;
}) {
  // Phones only: the rail opened over the page until the next pick.
  const [phoneOpen, setPhoneOpen] = useState(false);
  const collapsed = state === 'collapsed';

  /** Shown wherever the panel is wide: expanded, peeked or opened on a phone. */
  const wideOnly = cn(
    'whitespace-nowrap opacity-0 transition-opacity',
    MOTION,
    collapsed
      ? 'sm:group-hover/sidebar:opacity-100 sm:group-hover/sidebar:delay-120 sm:group-has-[:focus-visible]/sidebar:opacity-100'
      : 'sm:opacity-100',
    phoneOpen && 'max-sm:opacity-100',
  );

  return (
    // Holds the page's room for the panel; the panel itself is fixed so a peek covers the page.
    <div className={cn('w-14 shrink-0 transition-[width]', MOTION, !collapsed && 'sm:w-[232px]')}>
      <aside
        aria-label="Main navigation"
        className={cn(
          'group/sidebar fixed inset-y-0 left-0 z-40 flex w-14 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,box-shadow]',
          MOTION,
          collapsed
            ? 'sm:hover:w-[232px] sm:hover:shadow-lg sm:hover:delay-120 sm:has-[:focus-visible]:w-[232px] sm:has-[:focus-visible]:shadow-lg'
            : 'sm:w-[232px]',
          phoneOpen && 'max-sm:w-[232px] max-sm:shadow-lg',
        )}
      >
        <div className="flex h-12 shrink-0 items-center border-b border-sidebar-border px-3">
          <Link
            to="/"
            className={cn(
              'min-w-0 flex-1 truncate rounded-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/30',
              wideOnly,
            )}
          >
            {/* Padding inside, so the rail (where the link has no width) keeps the button centred. */}
            <span className="pl-1">ARV Intranet</span>
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            className="max-sm:hidden"
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            onClick={() => onStateChange(collapsed ? 'expanded' : 'collapsed')}
          >
            {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="sm:hidden"
            aria-expanded={phoneOpen}
            aria-label={phoneOpen ? 'Close navigation' : 'Open navigation'}
            onClick={() => setPhoneOpen((open) => !open)}
          >
            {phoneOpen ? <PanelLeftCloseIcon /> : <PanelLeftOpenIcon />}
          </Button>
        </div>
        <nav
          aria-label={section.label}
          className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2"
        >
          {visibleItems(section, me).map(({ label, to, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setPhoneOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex h-9 shrink-0 items-center gap-2.5 rounded-md px-3 font-medium text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/30',
                  isActive &&
                    'bg-background text-foreground ring-1 ring-border hover:bg-background',
                )
              }
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span className={wideOnly}>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="shrink-0 border-t border-sidebar-border p-2">
          <AccountMenu me={me} detailsClassName={wideOnly} />
        </div>
      </aside>
    </div>
  );
}
