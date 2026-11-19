import type { Project } from '@arv/contracts/projects';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MissingPermissionNotice } from '~/features/identity/components/refusal-screens';
import { ProjectList } from './project-list';

afterEach(cleanup);

const project = (n: number, extra: Partial<Project>): Project => ({
  id: `01933b8e-0000-7000-8000-00000000050${n}`,
  name: `Project ${n}`,
  type: 'client',
  closeDate: null,
  status: 'open',
  createdAt: new Date('2026-10-31T09:00:00Z'),
  ...extra,
});

const projects = [
  project(1, { name: 'Atlas CRM' }),
  project(2, { name: 'Cobalt billing', closeDate: '2026-11-17', status: 'closed' }),
  project(3, { name: 'Delta portal', closeDate: '2026-12-15' }),
  project(4, { name: 'Bench', type: 'bench' }),
  project(5, { name: 'Annual leave', type: 'leave' }),
];

function renderList(canManage: boolean, onClose = vi.fn()) {
  const Stub = createRoutesStub([
    {
      path: '/projects',
      Component: () => (
        <ProjectList projects={projects} canManage={canManage} action={null} onClose={onClose} />
      ),
    },
  ]);
  render(<Stub initialEntries={['/projects']} />);
  return onClose;
}

describe('ProjectList', () => {
  it('groups projects by type with their status and close date', async () => {
    renderList(true);
    const table = await screen.findByRole('table', { name: 'Projects' });
    expect(within(table).getByRole('rowheader', { name: /^Client · 3 projects/ })).toBeTruthy();
    expect(within(table).getByRole('rowheader', { name: /^Leave · 1 project/ })).toBeTruthy();
    expect(within(table).getByText('Closed · 17 Nov 2026')).toBeTruthy();
    expect(within(table).getByText('Open · until 15 Dec 2026')).toBeTruthy();
  });

  it('offers «Close project» on open projects only', async () => {
    const onClose = renderList(true);
    await screen.findByRole('table', { name: 'Projects' });
    expect(screen.queryByRole('button', { name: 'Close Cobalt billing' })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close Atlas CRM' }));
    expect(onClose).toHaveBeenCalledWith(projects[0]);
  });

  it('filters by type, status and name', async () => {
    renderList(true);
    const user = userEvent.setup();
    const table = await screen.findByRole('table', { name: 'Projects' });
    await user.click(
      within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: 'Closed' }),
    );
    expect(within(table).queryByText('Atlas CRM')).toBeNull();
    expect(within(table).getByText('Cobalt billing')).toBeTruthy();
    await user.click(
      within(screen.getByRole('group', { name: 'Type' })).getByRole('button', { name: 'Bench' }),
    );
    expect(screen.getByText('No projects match these filters.')).toBeTruthy();
  });

  it('is read-only without manage-projects (AC-26) and states the closed rule (AC-11)', async () => {
    renderList(false);
    await screen.findByRole('table', { name: 'Projects' });
    expect(screen.queryByRole('button', { name: /^Close / })).toBeNull();
    expect(
      screen.getByText(/Closed projects accept no new, changed or removed allocations\./),
    ).toBeTruthy();
    expect(screen.getByText(/needs the manage projects permission/)).toBeTruthy();
  });
});

describe('forbidden state (AC-26)', () => {
  it('names the missing permission and shows nothing of the page', async () => {
    const Stub = createRoutesStub([
      { path: '/', Component: () => <MissingPermissionNotice permission="manage projects" /> },
    ]);
    render(<Stub />);
    expect(
      await screen.findByRole('heading', {
        name: 'You don’t have the “manage projects” permission.',
      }),
    ).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
