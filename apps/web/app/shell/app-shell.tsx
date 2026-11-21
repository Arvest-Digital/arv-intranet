import type { Me } from '@arv/contracts/identity';
import { Link } from 'react-router';
import { AccountMenu } from '~/features/identity/components/account-menu';
import type { Section } from '~/shared/nav/section';
import { ThemeToggle } from '~/shared/theme/theme-toggle';
import { AppSidebar } from './app-sidebar';
import { SectionSwitcher } from './section-switcher';
import { useSidebar } from './use-sidebar';

/**
 * The signed-in frame: a top bar with the section switcher and theme, and — on a section's
 * pages — the section's side navigation. Pages render their own `<main>` and `h1`.
 */
export function AppShell({
  me,
  section,
  children,
}: {
  me: Me;
  section: Section | undefined;
  children: React.ReactNode;
}) {
  const [sidebar, setSidebar] = useSidebar();
  return (
    <div className="flex min-h-dvh">
      {section ? (
        <AppSidebar me={me} section={section} state={sidebar} onStateChange={setSidebar} />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-6 max-sm:px-4">
          {section ? null : (
            <Link
              to="/"
              className="rounded-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              ARV Intranet
            </Link>
          )}
          <div className="ml-auto flex items-center gap-1">
            <SectionSwitcher me={me} current={section} />
            <ThemeToggle />
            {/* Without a side navigation the account lives in the top bar. */}
            {section ? null : <AccountMenu me={me} compact />}
          </div>
        </header>
        <div className="mx-auto w-full max-w-[1280px] px-8 pt-8 pb-12 max-sm:px-4 max-sm:pt-6 max-sm:pb-10">
          {children}
        </div>
      </div>
    </div>
  );
}
