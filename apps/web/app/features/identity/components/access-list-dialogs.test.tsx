import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { admin, anna, planner, roles, staff } from '../test-data';
import type { AccessListActionResult } from './access-list-form';
import { AddUserDialog } from './add-user-dialog';
import { RemoveUserDialog, RenameUserDialog, UserRolesDialog } from './user-roles-dialog';

afterEach(cleanup);

const LAST_ADMIN = 'The intranet must keep at least one admin. Appoint another admin first.';

/** Renders `ui` on a route whose action records each submitted form and answers `answer`. */
function renderWithAction(ui: React.ReactNode, answer: AccessListActionResult = { ok: true }) {
  const forms: FormData[] = [];
  const Stub = createRoutesStub([
    {
      path: '/access/users',
      Component: () => ui,
      action: async ({ request }) => {
        forms.push(await request.formData());
        return answer;
      },
    },
  ]);
  render(<Stub initialEntries={['/access/users']} />);
  return forms;
}

const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;

describe('AddUserDialog (AC-04, AC-13)', () => {
  it('ticks the pre-selected role by default, and it can be unticked', async () => {
    const forms = renderWithAction(<AddUserDialog roles={roles} defaultOpen />);
    const user = userEvent.setup();

    expect(
      (await screen.findByRole('checkbox', { name: 'Staff' })) as HTMLInputElement,
    ).toMatchObject({ checked: true });
    expect(checkbox('Planner').checked).toBe(false);
    expect(checkbox('Admin').checked).toBe(false);

    await user.click(checkbox('Staff'));
    await user.click(checkbox('Planner'));
    await user.type(screen.getByLabelText('Company email'), 'bob@arvest.digital');
    await user.type(screen.getByLabelText('Name'), 'Bob');
    await user.click(screen.getByRole('button', { name: 'Add user' }));

    await waitFor(() => expect(forms).toHaveLength(1));
    expect(forms[0]!.get('intent')).toBe('add');
    expect(forms[0]!.getAll('accessRoleId')).toEqual([planner.id]);
    // Closes once the action answers ok.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows the api refusal inline and stays open (AC-05)', async () => {
    renderWithAction(<AddUserDialog roles={roles} defaultOpen />, {
      ok: false,
      error: 'Only company-domain addresses can be added',
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Company email'), 'bob@example.com');
    await user.type(screen.getByLabelText('Name'), 'Bob');
    await user.click(screen.getByRole('button', { name: 'Add user' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Only company-domain addresses can be added',
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

describe('UserRolesDialog (AC-12)', () => {
  it('shows the ticked roles combined permissions in plain words and posts the set', async () => {
    const forms = renderWithAction(
      <UserRolesDialog user={anna} roles={roles} open onOpenChange={vi.fn()} />,
    );
    const user = userEvent.setup();

    expect(
      ((await screen.findByRole('checkbox', { name: 'Staff' })) as HTMLInputElement).checked,
    ).toBe(true);
    expect(checkbox('Planner').checked).toBe(true);
    expect(screen.getByText('Edit allocations')).toBeTruthy();
    expect(screen.queryByText('Manage access')).toBeNull();

    await user.click(checkbox('Admin'));
    expect(screen.getByText('Manage access')).toBeTruthy();
    expect(screen.getByText('Add and remove people and decide what they may do.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(forms).toHaveLength(1));
    expect(forms[0]!.get('intent')).toBe('set-roles');
    expect(forms[0]!.get('userId')).toBe(anna.id);
    expect(forms[0]!.getAll('accessRoleId').sort()).toEqual(
      [admin.id, staff.id, planner.id].sort(),
    );
  });

  it('shows «appoint another admin first» when taking away the last admin (AC-14)', async () => {
    renderWithAction(<UserRolesDialog user={anna} roles={roles} open onOpenChange={vi.fn()} />, {
      ok: false,
      error: LAST_ADMIN,
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Appoint another admin first');
  });
});

describe('RemoveUserDialog (AC-07, AC-14)', () => {
  it('confirms, then shows «appoint another admin first» for the last admin', async () => {
    const onOpenChange = vi.fn();
    const forms = renderWithAction(
      <RemoveUserDialog user={anna} open onOpenChange={onOpenChange} />,
      { ok: false, error: LAST_ADMIN },
    );
    const user = userEvent.setup();

    expect(await screen.findByText('Remove Anna Kovalenko?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Appoint another admin first');
    expect(forms[0]!.get('intent')).toBe('remove');
    expect(forms[0]!.get('userId')).toBe(anna.id);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe('RenameUserDialog (AC-21)', () => {
  it('posts only the new name and closes', async () => {
    const onOpenChange = vi.fn();
    const forms = renderWithAction(
      <RenameUserDialog user={anna} open onOpenChange={onOpenChange} />,
    );
    const user = userEvent.setup();

    const name = await screen.findByLabelText('Name');
    expect(screen.queryByLabelText(/email/i)).toBeNull();
    await user.clear(name);
    await user.type(name, 'Anna Koval');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect([...forms[0]!.keys()].sort()).toEqual(['intent', 'name', 'userId']);
    expect(forms[0]!.get('name')).toBe('Anna Koval');
  });
});
