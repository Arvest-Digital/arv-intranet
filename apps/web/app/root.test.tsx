import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoutesStub, data, Outlet, useMatches, useRouteLoaderData } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { ErrorBoundary } from './root';
import { handle as accessHandle } from './sections/access';
import { handle as scheduleHandle } from './sections/schedule';
import { sectionOf } from './shared/nav/section';
import { PATHS } from './shared/paths';
import { AppShell } from './shell/app-shell';
import type { SidebarState } from './shell/sidebar';

afterEach(cleanup);

const me = (permissions: string[]) => ({
  id: '6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e91',
  email: 'ann@arvest.digital',
  name: 'Ann',
  permissions,
});

const IMPORT = [
  'scheduling:edit-allocations',
  'org:manage-employee-records',
  'projects:manage-projects',
];

/** The root `Layout`'s shell over stand-in pages, each section's pages under its layout route. */
function renderShell(path: string, permissions: string[], sidebar: SidebarState = 'expanded') {
  const posted: string[] = [];
  function Root() {
    const root = useRouteLoaderData<{ me: ReturnType<typeof me> }>('root');
    const section = sectionOf(useMatches());
    return root ? (
      <AppShell me={root.me} section={section}>
        <Outlet />
      </AppShell>
    ) : null;
  }
  const page = (name: string) => () => <h1>{name}</h1>;
  const Stub = createRoutesStub([
    {
      id: 'root',
      path: '/',
      Component: Root,
      loader: () => ({ me: me(permissions), sidebar }),
      children: [
        { index: true, Component: page('Home') },
        {
          handle: scheduleHandle,
          children: [
            { path: PATHS.board, Component: page('Board') },
            { path: PATHS.mySchedule, Component: page('My schedule') },
          ],
        },
        { handle: accessHandle, children: [{ path: PATHS.accessUsers, Component: page('Users') }] },
        {
          path: 'sidebar',
          action: async ({ request }) => {
            posted.push(String((await request.formData()).get('sidebar')));
            return null;
          },
        },
      ],
    },
  ]);
  render(<Stub initialEntries={[path]} />);
  return { posted };
}

const sideNav = () => screen.findByRole('complementary', { name: 'Main navigation' });
const linkNames = (container: HTMLElement) =>
  within(container)
    .getAllByRole('link')
    .map((link) => link.textContent);

describe('section navigation by permission (AC-08)', () => {
  it("shows the section's pages the user may open in the side navigation", async () => {
    renderShell(PATHS.board, ['scheduling:view-whole-board']);
    const nav = within(await sideNav()).getByRole('navigation', { name: 'Schedule' });
    expect(linkNames(nav)).toEqual(['Schedule', 'My schedule', 'Projects', 'Holidays']);
    expect(within(nav).getByRole('link', { name: 'Schedule' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('shows «Import» only with all three import permissions (AC-33)', async () => {
    renderShell(PATHS.mySchedule, IMPORT);
    expect(within(await sideNav()).getByRole('link', { name: 'Import' })).toBeTruthy();
    for (const left of IMPORT) {
      cleanup();
      renderShell(
        PATHS.mySchedule,
        IMPORT.filter((p) => p !== left),
      );
      expect(within(await sideNav()).queryByRole('link', { name: 'Import' })).toBeNull();
    }
  });

  it('offers «Access & users» in the switcher only with manage access', async () => {
    const user = userEvent.setup();
    renderShell(PATHS.mySchedule, ['identity:manage-access']);
    await user.click(await screen.findByRole('button', { name: 'Schedule' }));
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Schedule', 'Access & users']);
    expect(items[0]?.getAttribute('aria-current')).toBe('page');
    // Each section opens on its first page the user may open.
    expect(items[0]?.getAttribute('href')).toBe(PATHS.mySchedule);
    expect(items[1]?.getAttribute('href')).toBe(PATHS.accessUsers);

    cleanup();
    renderShell(PATHS.mySchedule, []);
    await user.click(await screen.findByRole('button', { name: 'Schedule' }));
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual([
      'Schedule',
    ]);
  });

  it('shows the switcher and the account but no side navigation on Home', async () => {
    renderShell('/', ['identity:manage-access']);
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy();
    expect(screen.queryByRole('complementary', { name: 'Main navigation' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Sections' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ann' })).toBeTruthy();
  });

  it('puts the signed-in user and the sign-out menu at the foot of the side navigation', async () => {
    renderShell(PATHS.accessUsers, ['identity:manage-access']);
    expect(
      within(await sideNav()).getByRole('button', { name: 'Ann ann@arvest.digital' }),
    ).toBeTruthy();
  });
});

describe('collapsing the side navigation', () => {
  it('keeps the choice by posting it to /sidebar', async () => {
    const user = userEvent.setup();
    const { posted } = renderShell(PATHS.mySchedule, []);
    const collapse = within(await sideNav()).getByRole('button', { name: 'Collapse navigation' });
    expect(collapse.getAttribute('aria-expanded')).toBe('true');
    await user.click(collapse);
    await waitFor(() => expect(posted).toEqual(['collapsed']));
  });

  it('starts collapsed from the cookie and offers to expand', async () => {
    renderShell(PATHS.mySchedule, [], 'collapsed');
    const expand = within(await sideNav()).getByRole('button', { name: 'Expand navigation' });
    expect(expand.getAttribute('aria-expanded')).toBe('false');
    // Collapsed labels stay in the DOM, so the links keep their names.
    expect(within(await sideNav()).getByRole('link', { name: 'My schedule' })).toBeTruthy();
  });
});

describe('root error boundary', () => {
  const renderThrown = (thrown: unknown) => {
    const Stub = createRoutesStub([
      {
        id: 'root',
        path: '/',
        Component: () => null,
        ErrorBoundary: ErrorBoundary as never,
        loader: () => {
          throw thrown;
        },
      },
    ]);
    render(<Stub initialEntries={['/']} />);
  };

  it('tells a removed user they no longer have access (AC-07)', async () => {
    renderThrown(data({ reason: 'access-removed' }, { status: 401 }));
    expect(await screen.findByRole('heading', { name: 'Access removed' })).toBeTruthy();
    expect(screen.getByText('You no longer have access to the intranet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeTruthy();
  });

  it('tells a user without the permission so, showing nothing else (AC-08)', async () => {
    renderThrown(data({ reason: 'missing-permission' }, { status: 403 }));
    expect(
      await screen.findByRole('heading', { name: "You don't have permission to manage access." }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to home' }).getAttribute('href')).toBe('/');
  });

  it('shows a bare error page with no data when the gate fails', async () => {
    renderThrown(data('Something went wrong', { status: 502 }));
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeTruthy();
  });
});
