import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoutesStub, redirect, useActionData } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalog, planner, retiredPlanner, staff } from '../test-data';
import type { AccessListActionResult } from './access-list-form';
import { AccessRoleForm } from './access-role-form';
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

const checkbox = (name: string | RegExp) => screen.getByRole('checkbox', { name });
const ticked = (box: HTMLElement) => box.getAttribute('aria-checked') === 'true';

/**
 * Renders the role page at `/access/roles/new` (or the role's own path) on a route whose action
 * records each submitted form and answers `answer`; a redirect lands on the roles list.
 */
function renderRolePage(
  props: Omit<React.ComponentProps<typeof AccessRoleForm>, 'result'>,
  answer: AccessListActionResult | 'redirect' = 'redirect',
) {
  const forms: FormData[] = [];
  const Stub = createRoutesStub([
    {
      path: props.role ? `/access/roles/${props.role.id}` : '/access/roles/new',
      Component: () => <AccessRoleForm {...props} result={useActionData()} />,
      action: async ({ request }) => {
        forms.push(await request.formData());
        return answer === 'redirect' ? redirect('/access/roles') : answer;
      },
    },
    { path: '/access/roles', Component: () => <h1>Roles list</h1> },
  ]);
  render(
    <Stub initialEntries={[props.role ? `/access/roles/${props.role.id}` : '/access/roles/new']} />,
  );
  return forms;
}

describe('AccessRoleForm, new role (AC-09, AC-10, AC-13)', () => {
  it('offers declared permissions grouped by feature, in plain words, and posts the ticked keys', async () => {
    const forms = renderRolePage({ catalog });
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'New role' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Roles' }).getAttribute('href')).toBe('/access/roles');
    expect(screen.getByRole('group', { name: 'Permissions' })).toBeTruthy();
    const scheduling = screen.getByRole('group', { name: 'Resource scheduling' });
    expect(within(scheduling).getByText('Edit allocations')).toBeTruthy();
    expect(
      within(scheduling).getByText('Change who works on which project and for how long.'),
    ).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Identity' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Retired permissions' })).toBeNull();
    expect(ticked(checkbox('Pre-select for new users'))).toBe(false);

    await user.type(screen.getByLabelText('Name'), 'Planner');
    await user.click(checkbox(/Edit allocations/));
    expect(ticked(checkbox(/Edit allocations/))).toBe(true);
    await user.click(checkbox('Pre-select for new users'));
    await user.click(screen.getByRole('button', { name: 'Save role' }));

    await waitFor(() => expect(forms).toHaveLength(1));
    expect(forms[0]!.get('intent')).toBe('create');
    expect(forms[0]!.get('accessRoleId')).toBeNull();
    expect(forms[0]!.get('name')).toBe('Planner');
    expect(forms[0]!.getAll('permissionKey')).toEqual(['scheduling:edit-allocations']);
    expect(forms[0]!.get('preselected')).toBe('on');
    // Saved: back on the roles list.
    expect(await screen.findByRole('heading', { name: 'Roles list' })).toBeTruthy();
  });

  it('shows the duplicate-name 409 under the name and stays on the page (AC-10)', async () => {
    const message = 'An access role with that name already exists.';
    renderRolePage({ catalog }, { ok: false, error: message, field: 'name' });
    const user = userEvent.setup();
    const name = await screen.findByLabelText('Name');
    await user.type(name, 'planner ');
    await user.click(screen.getByRole('button', { name: 'Save role' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(message);
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(name.getAttribute('aria-describedby')).toBe(alert.id);
    expect(screen.getByRole('heading', { name: 'New role' })).toBeTruthy();
  });

  it('shows a refusal that names no field as an alert above the buttons (AC-14)', async () => {
    const message = 'The intranet must keep at least one admin. Appoint another admin first.';
    renderRolePage({ catalog }, { ok: false, error: message });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name'), 'Planner');
    await user.click(screen.getByRole('button', { name: 'Save role' }));

    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(screen.getByLabelText('Name').getAttribute('aria-invalid')).toBeNull();
  });

  it('cancels back to the roles list', async () => {
    renderRolePage({ catalog });
    const cancel = await screen.findByRole('link', { name: 'Cancel' });
    expect(cancel.getAttribute('href')).toBe('/access/roles');
  });
});

describe('AccessRoleForm, existing role (AC-13, AC-16)', () => {
  it('shows a retired key flagged and removable, and never offers it among the permissions', async () => {
    const forms = renderRolePage({ role: retiredPlanner, catalog });
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'Edit Board planner' })).toBeTruthy();
    const retired = screen.getByRole('group', { name: 'Retired permissions' });
    expect(within(retired).getByText('scheduling:view-board')).toBeTruthy();
    expect(within(retired).getByText(/No longer declared by any feature/)).toBeTruthy();
    // The picker's feature groups offer declared permissions only.
    for (const group of screen.getAllByRole('group')) {
      if (group === retired || group.contains(retired)) continue;
      expect(within(group).queryByText('scheduling:view-board')).toBeNull();
    }
    // One box per declared permission, plus the pre-selected box; the retired key has none.
    expect(screen.getAllByRole('checkbox')).toHaveLength(catalog.length + 1);
    expect(ticked(checkbox('Pre-select for new users'))).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Remove scheduling:view-board' }));
    expect(screen.queryByRole('group', { name: 'Retired permissions' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save role' }));

    await waitFor(() => expect(forms).toHaveLength(1));
    expect(forms[0]!.get('intent')).toBe('update');
    expect(forms[0]!.get('accessRoleId')).toBe(retiredPlanner.id);
    expect(forms[0]!.get('name')).toBe('Board planner');
    expect(forms[0]!.getAll('permissionKey')).toEqual(['scheduling:edit-allocations']);
    expect(forms[0]!.get('preselected')).toBe('on');
  });

  it('keeps posting a retired key that was not removed', async () => {
    const forms = renderRolePage({ role: retiredPlanner, catalog });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Save role' }));

    await waitFor(() => expect(forms).toHaveLength(1));
    expect(forms[0]!.getAll('permissionKey').sort()).toEqual([
      'scheduling:edit-allocations',
      'scheduling:view-board',
    ]);
  });

  it('shows no retired section for a role without retired keys, and can untick the mark', async () => {
    const forms = renderRolePage({ role: { ...planner, isPreselected: true }, catalog });
    const user = userEvent.setup();
    expect(((await screen.findByLabelText('Name')) as HTMLInputElement).value).toBe('Planner');
    expect(ticked(checkbox(/Edit allocations/))).toBe(true);
    expect(ticked(checkbox(/Manage access/))).toBe(false);
    expect(screen.queryByRole('group', { name: 'Retired permissions' })).toBeNull();

    await user.click(checkbox('Pre-select for new users'));
    await user.click(screen.getByRole('button', { name: 'Save role' }));
    await waitFor(() => expect(forms).toHaveLength(1));
    expect(forms[0]!.get('preselected')).toBeNull();
  });
});

describe('AccessRoleList (AC-13, AC-16)', () => {
  it('flags a role granting a retired permission, and marks the pre-selected one', async () => {
    renderWithAction(<AccessRoleList roles={[staff, retiredPlanner]} />);

    const flaggedLink = await screen.findByRole('link', { name: 'Board planner' });
    expect(flaggedLink.getAttribute('href')).toBe(`/access/roles/${retiredPlanner.id}`);
    const flaggedRow = flaggedLink.closest('tr')!;
    expect(within(flaggedRow).getByText('Grants a retired permission')).toBeTruthy();
    expect(within(flaggedRow).getByText('Edit allocations')).toBeTruthy();
    expect(within(flaggedRow).getByText('5')).toBeTruthy();

    const staffRow = screen.getByRole('link', { name: 'Staff' }).closest('tr')!;
    expect(within(staffRow).getByText('Pre-selected for new users')).toBeTruthy();
    expect(within(staffRow).getByText('No permissions')).toBeTruthy();
    expect(within(staffRow).queryByText(/retired/)).toBeNull();
  });

  it('marks a role pre-selected, or clears the mark with an empty id', async () => {
    const forms = renderWithAction(<AccessRoleList roles={[staff, planner]} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Actions for Planner' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Pre-select for new users' }));
    await waitFor(() => expect(forms).toHaveLength(1));
    expect(forms[0]!.get('intent')).toBe('preselect');
    expect(forms[0]!.get('accessRoleId')).toBe(planner.id);

    await user.click(screen.getByRole('button', { name: 'Actions for Staff' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Clear pre-selection' }));
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

    expect(await screen.findByRole('dialog', { name: 'Delete Board planner?' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    expect(
      screen.getByText(
        '5 users hold it. They lose what it grants unless another of their roles grants it.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Board planner is pre-selected for new users. After deleting, no role is pre-selected.',
      ),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Delete role' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(forms[0]!.get('intent')).toBe('delete');
    expect(forms[0]!.get('accessRoleId')).toBe(retiredPlanner.id);
  });

  it('leaves out the pre-selected note for an unmarked role', async () => {
    renderWithAction(<DeleteRoleDialog role={planner} open onOpenChange={vi.fn()} />);
    expect(await screen.findByText('Nobody holds it.')).toBeTruthy();
    expect(screen.queryByText(/pre-selected/)).toBeNull();
  });

  it('says so when one user holds the role', async () => {
    renderWithAction(
      <DeleteRoleDialog role={{ ...planner, holderCount: 1 }} open onOpenChange={vi.fn()} />,
    );
    expect(await screen.findByText(/^1 user holds it\. They lose what it grants/)).toBeTruthy();
  });

  it('shows «appoint another admin first» inline for the last admin (AC-14)', async () => {
    const message = 'The intranet must keep at least one admin. Appoint another admin first.';
    renderWithAction(<DeleteRoleDialog role={planner} open onOpenChange={vi.fn()} />, {
      ok: false,
      error: message,
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Delete role' }));
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
