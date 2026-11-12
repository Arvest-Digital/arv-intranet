import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalog, planner, retiredPlanner, staff } from '../test-data';
import type { AccessListActionResult } from './access-list-form';
import { EditAccessRoleDialog, NewAccessRoleDialog } from './access-role-form';
import { AccessRoleList } from './access-role-list';
import { DeleteRoleDialog } from './delete-role-dialog';

afterEach(cleanup);

/** Renders `ui` on a route whose action records each submitted form and answers `answer`. */
function renderWithAction(ui: React.ReactNode, answer: AccessListActionResult = { ok: true }) {
  const forms: FormData[] = [];
  const Stub = createRoutesStub([
    {
      path: '/access/roles',
      Component: () => ui,
      action: async ({ request }) => {
        forms.push(await request.formData());
        return answer;
      },
    },
  ]);
  render(<Stub initialEntries={['/access/roles']} />);
  return forms;
}

const checkbox = (name: string | RegExp) =>
  screen.getByRole('checkbox', { name }) as HTMLInputElement;

describe('NewAccessRoleDialog (AC-09, AC-10)', () => {
  it('offers declared permissions grouped by feature, in plain words, and posts the ticked keys', async () => {
    const forms = renderWithAction(<NewAccessRoleDialog catalog={catalog} defaultOpen />);
    const user = userEvent.setup();

    const scheduling = await screen.findByRole('group', { name: 'Resource scheduling' });
    expect(within(scheduling).getByText('Edit allocations')).toBeTruthy();
    expect(
      within(scheduling).getByText('Change who works on which project and for how long.'),
    ).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Identity' })).toBeTruthy();

    await user.type(screen.getByLabelText('Name'), 'Planner');
    await user.click(checkbox(/Edit allocations/));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(forms).toHaveLength(1));
    expect(forms[0]!.get('intent')).toBe('create');
    expect(forms[0]!.get('name')).toBe('Planner');
    expect(forms[0]!.getAll('permissionKey')).toEqual(['scheduling:edit-allocations']);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows the duplicate-name 409 inline and stays open (AC-10)', async () => {
    const message = 'An access role with that name already exists';
    renderWithAction(<NewAccessRoleDialog catalog={catalog} defaultOpen />, {
      ok: false,
      error: message,
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name'), 'planner ');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

describe('EditAccessRoleDialog (AC-16)', () => {
  it('shows a retired key flagged and removable, and never offers it among the permissions', async () => {
    const forms = renderWithAction(
      <EditAccessRoleDialog role={retiredPlanner} catalog={catalog} open onOpenChange={vi.fn()} />,
    );
    const user = userEvent.setup();

    const retired = await screen.findByRole('group', { name: 'Retired permissions' });
    const retiredBox = within(retired).getByRole('checkbox', {
      name: 'scheduling:view-board',
    }) as HTMLInputElement;
    expect(retiredBox.checked).toBe(true);
    // The picker's feature groups offer declared permissions only.
    for (const group of screen.getAllByRole('group')) {
      if (group === retired) continue;
      expect(within(group).queryByText('scheduling:view-board')).toBeNull();
    }
    expect(screen.getAllByRole('checkbox')).toHaveLength(catalog.length + 1);

    await user.click(retiredBox);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(forms).toHaveLength(1));
    expect(forms[0]!.get('intent')).toBe('update');
    expect(forms[0]!.get('accessRoleId')).toBe(retiredPlanner.id);
    expect(forms[0]!.getAll('permissionKey')).toEqual(['scheduling:edit-allocations']);
  });

  it('shows no retired section for a role without retired keys', async () => {
    renderWithAction(
      <EditAccessRoleDialog role={planner} catalog={catalog} open onOpenChange={vi.fn()} />,
    );
    expect(((await screen.findByLabelText('Name')) as HTMLInputElement).value).toBe('Planner');
    expect(checkbox(/Edit allocations/).checked).toBe(true);
    expect(screen.queryByRole('group', { name: 'Retired permissions' })).toBeNull();
  });
});

describe('AccessRoleList (AC-13, AC-16)', () => {
  it('flags a role granting a retired permission, naming the key, and marks the pre-selected one', async () => {
    renderWithAction(<AccessRoleList roles={[staff, retiredPlanner]} catalog={catalog} />);

    const flaggedRow = (await screen.findByText('Board planner')).closest('tr')!;
    expect(within(flaggedRow).getByText(/Grants retired permission/)).toBeTruthy();
    expect(within(flaggedRow).getByText('scheduling:view-board')).toBeTruthy();
    expect(within(flaggedRow).getByText('5')).toBeTruthy();

    const staffRow = screen.getByText('Staff').closest('tr')!;
    expect(within(staffRow).getByText('Pre-selected')).toBeTruthy();
    expect(within(staffRow).queryByText(/retired/)).toBeNull();
  });

  it('marks a role pre-selected, or clears the mark with an empty id', async () => {
    const forms = renderWithAction(<AccessRoleList roles={[staff, planner]} catalog={catalog} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Actions for Planner' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Pre-select for new people' }));
    await waitFor(() => expect(forms).toHaveLength(1));
    expect(forms[0]!.get('intent')).toBe('preselect');
    expect(forms[0]!.get('accessRoleId')).toBe(planner.id);

    await user.click(screen.getByRole('button', { name: 'Actions for Staff' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Clear pre-selected mark' }));
    await waitFor(() => expect(forms).toHaveLength(2));
    expect(forms[1]!.get('accessRoleId')).toBe('');
  });
});

describe('DeleteRoleDialog (AC-11, AC-14)', () => {
  it('warns with the holder count and the pre-selected note, then confirms', async () => {
    const onOpenChange = vi.fn();
    const forms = renderWithAction(
      <DeleteRoleDialog role={retiredPlanner} open onOpenChange={onOpenChange} />,
    );
    const user = userEvent.setup();

    expect(await screen.findByText('Delete Board planner?')).toBeTruthy();
    expect(screen.getByText(/5 users hold this role/)).toBeTruthy();
    expect(screen.getByText(/is pre-selected for new people/)).toBeTruthy();
    expect(screen.getByText(/no role is pre-selected/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(forms[0]!.get('intent')).toBe('delete');
    expect(forms[0]!.get('accessRoleId')).toBe(retiredPlanner.id);
  });

  it('leaves out the pre-selected note for an unmarked role', async () => {
    renderWithAction(<DeleteRoleDialog role={planner} open onOpenChange={vi.fn()} />);
    expect(await screen.findByText(/No users hold this role/)).toBeTruthy();
    expect(screen.queryByText(/pre-selected/)).toBeNull();
  });

  it('shows «appoint another admin first» inline for the last admin (AC-14)', async () => {
    const message = 'The intranet must keep at least one admin. Appoint another admin first.';
    renderWithAction(<DeleteRoleDialog role={planner} open onOpenChange={vi.fn()} />, {
      ok: false,
      error: message,
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    expect((await screen.findByRole('alert')).textContent).toBe(message);
  });
});
