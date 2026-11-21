import type { Project } from '@arv/contracts/projects';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PATHS } from '~/shared/paths';
import { PROJECT_MESSAGE, type ProjectActionResult } from '../project';
import { ProjectCloseDialog } from './project-close-dialog';
import { ProjectCreateDialog } from './project-create-dialog';

afterEach(cleanup);

function renderWithAction(ui: React.ReactNode, ...answers: ProjectActionResult[]) {
  const forms: FormData[] = [];
  const Stub = createRoutesStub([
    {
      path: PATHS.projects,
      Component: () => ui,
      action: async ({ request }) => {
        forms.push(await request.formData());
        return answers[Math.min(forms.length, answers.length) - 1];
      },
    },
  ]);
  render(<Stub initialEntries={[PATHS.projects]} />);
  return forms;
}

const atlas: Project = {
  id: '01933b8e-0000-7000-8000-000000000501',
  name: 'Atlas CRM',
  type: 'client',
  closeDate: null,
  status: 'open',
  createdAt: new Date('2026-10-31T09:00:00Z'),
};

describe('ProjectCreateDialog', () => {
  it('sends the name and the chosen type', async () => {
    const onCreated = vi.fn();
    const forms = renderWithAction(
      <ProjectCreateDialog open onOpenChange={() => {}} onCreated={onCreated} />,
      { ok: true, intent: 'create', projectId: atlas.id },
    );
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    await user.type(within(dialog).getByLabelText('Name'), 'Atlas CRM');
    await user.click(within(dialog).getByRole('radio', { name: 'Training' }));
    expect(within(dialog).getByText('Courses and learning.')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(atlas.id));
    expect(forms[0]!.get('name')).toBe('Atlas CRM');
    expect(forms[0]!.get('type')).toBe('training');
  });

  it('says an open project already uses the name (AC-24)', async () => {
    renderWithAction(<ProjectCreateDialog open onOpenChange={() => {}} />, {
      ok: false,
      kind: 'invalid',
      fieldErrors: { name: PROJECT_MESSAGE.duplicate('atlas') },
    });
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    await user.type(within(dialog).getByLabelText('Name'), 'atlas ');
    await user.click(within(dialog).getByRole('button', { name: 'Create project' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'An open project named “atlas” already exists.',
    );
    expect(within(dialog).getByLabelText('Name').getAttribute('aria-invalid')).toBe('true');
  });
});

describe('ProjectCloseDialog', () => {
  const preview: ProjectActionResult = {
    ok: false,
    kind: 'confirm',
    closeDate: '2026-12-15',
    ending: [
      {
        allocationId: 'a1',
        employeeName: 'Olena Kovalenko',
        startsOn: '2026-10-26',
        endsOn: '2027-01-29',
      },
      {
        allocationId: 'a2',
        employeeName: 'Iryna Bondar',
        startsOn: '2026-11-02',
        endsOn: '2027-02-05',
      },
    ],
    removed: [
      {
        allocationId: 'a3',
        employeeName: 'Kateryna Shevchuk',
        startsOn: '2027-01-04',
        endsOn: '2027-01-29',
      },
    ],
  };

  it('lists the trims and removals and closes only once confirmed (AC-25)', async () => {
    const onClosed = vi.fn();
    const forms = renderWithAction(
      <ProjectCloseDialog
        project={atlas}
        today="2026-11-18"
        onOpenChange={() => {}}
        onClosed={onClosed}
      />,
      preview,
      { ok: true, intent: 'close', projectId: atlas.id, closeDate: '2026-12-15' },
    );
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog', { name: 'Close Atlas CRM' });
    await user.type(within(dialog).getByLabelText('Close date'), '2026-12-15');
    await user.click(within(dialog).getByRole('button', { name: 'Review changes' }));

    const review = await screen.findByRole('alertdialog', { name: 'Review the close' });
    expect(
      within(review).getByRole('heading', { name: 'Close Atlas CRM on 15 Dec 2026' }),
    ).toBeTruthy();
    const ending = within(review).getByRole('region', { name: '2 allocations end on 15 Dec' });
    expect(within(ending).getByText('Olena Kovalenko')).toBeTruthy();
    expect(within(ending).getByText('2026-10-26 – 2027-01-29')).toBeTruthy();
    expect(within(ending).getAllByText('2026-12-15')).toHaveLength(2);
    const removed = within(review).getByRole('region', {
      name: '1 allocation start after it and is removed',
    });
    expect(within(removed).getByText('Kateryna Shevchuk')).toBeTruthy();
    expect(within(removed).getByText('Removed')).toBeTruthy();
    expect(onClosed).not.toHaveBeenCalled();
    expect(forms[0]!.get('confirm')).toBeNull();

    await user.click(within(review).getByRole('button', { name: 'Close project' }));
    await waitFor(() => expect(forms).toHaveLength(2));
    expect(forms[1]!.get('confirm')).toBe('true');
    expect(forms[1]!.get('closeDate')).toBe('2026-12-15');
    expect(forms[1]!.get('projectId')).toBe(atlas.id);
    await waitFor(() => expect(onClosed).toHaveBeenCalledWith(atlas.id, '2026-12-15'));
  });

  it('goes back to the date without closing', async () => {
    const forms = renderWithAction(
      <ProjectCloseDialog project={atlas} today="2026-11-18" onOpenChange={() => {}} />,
      preview,
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Close date'), '2026-12-15');
    await user.click(screen.getByRole('button', { name: 'Review changes' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Back' }),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByLabelText('Close date')).toBeTruthy();
    expect(forms).toHaveLength(1);
  });

  it('refuses a past close date without calling the action (AC-25)', async () => {
    const forms = renderWithAction(
      <ProjectCloseDialog project={atlas} today="2026-11-18" onOpenChange={() => {}} />,
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Close date'), '2026-11-10');
    expect(screen.getByRole('alert').textContent).toBe(PROJECT_MESSAGE.closeDateInPast);
    expect(
      (screen.getByRole('button', { name: 'Review changes' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(forms).toHaveLength(0);
  });
});
