import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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

const checkbox = (name: string) => screen.getByRole('checkbox', { name });
const ticked = (box: HTMLElement) => box.getAttribute('aria-checked') === 'true';

describe('AddUserDialog (AC-04, AC-13)', () => {
  it('ticks the pre-selected role by default, and it can be unticked', async () => {
    const forms = renderWithAction(<AddUserDialog roles={roles} defaultOpen />);
    const user = userEvent.setup();

    const dialog = await screen.findByRole('dialog', { name: 'Add user' });
    expect(
      within(dialog).getByText(
        "They can sign in with their Google account once they're on the list.",
      ),
    ).toBeTruthy();
    expect(ticked(checkbox('Staff'))).toBe(true);
    expect(within(dialog).getByText('Pre-selected for new users')).toBeTruthy();
    expect(ticked(checkbox('Planner'))).toBe(false);
    expect(ticked(checkbox('Admin'))).toBe(false);

    await user.click(checkbox('Staff'));
    await user.click(checkbox('Planner'));
    expect(ticked(checkbox('Staff'))).toBe(false);
    expect(ticked(checkbox('Planner'))).toBe(true);
    await user.type(screen.getByLabelText('Email'), 'bob@arvest.digital');
    await user.type(screen.getByLabelText('Name'), 'Bob');
    await user.click(within(dialog).getByRole('button', { name: 'Add user' }));

    await waitFor(() => expect(forms).toHaveLength(1));
    expect(forms[0]!.get('intent')).toBe('add');
    expect(forms[0]!.get('email')).toBe('bob@arvest.digital');
    expect(forms[0]!.getAll('accessRoleId')).toEqual([planner.id]);
    // Closes once the action answers ok.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows the api refusal under the email and stays open (AC-05)', async () => {
    const message = 'Only company-domain addresses can be added.';
    renderWithAction(<AddUserDialog roles={roles} defaultOpen />, {
      ok: false,
      error: message,
      field: 'email',
    });
    const user = userEvent.setup();
    const email = await screen.findByLabelText('Email');
    await user.type(email, 'bob@example.com');
    await user.type(screen.getByLabelText('Name'), 'Bob');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add user' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(message);
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(email.getAttribute('aria-describedby')).toBe(alert.id);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('shows a refusal that names no field as an alert above the fields', async () => {
    renderWithAction(<AddUserDialog roles={roles} defaultOpen />, {
      ok: false,
      error: 'Could not add the user',
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), 'bob@arvest.digital');
    await user.type(screen.getByLabelText('Name'), 'Bob');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add user' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Could not add the user');
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBeNull();
  });
});

describe('UserRolesDialog (AC-12)', () => {
  it('shows the ticked roles combined permissions in plain words and posts the set', async () => {
    const forms = renderWithAction(
      <UserRolesDialog user={anna} roles={roles} open onOpenChange={vi.fn()} />,
    );
    const user = userEvent.setup();

    const dialog = await screen.findByRole('dialog', { name: 'Change roles' });
    expect(within(dialog).getByText('Anna Kovalenko · anna@arvest.digital')).toBeTruthy();
    expect(ticked(checkbox('Staff'))).toBe(true);
    expect(ticked(checkbox('Planner'))).toBe(true);
    const canDo = screen.getByRole('region', { name: 'What they can do' });
    expect(within(canDo).getByText('Resource scheduling')).toBeTruthy();
    expect(within(canDo).getByText('Edit allocations.')).toBeTruthy();
    expect(within(canDo).queryByText('Manage access.')).toBeNull();

    await user.click(checkbox('Admin'));
    expect(within(canDo).getByText('Identity')).toBeTruthy();
    expect(within(canDo).getByText('Manage access.')).toBeTruthy();
    expect(
      within(canDo).getByText('Add and remove people and decide what they may do.'),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Save roles' }));
    await waitFor(() => expect(forms).toHaveLength(1));
    expect(forms[0]!.get('intent')).toBe('set-roles');
    expect(forms[0]!.get('userId')).toBe(anna.id);
    expect(forms[0]!.getAll('accessRoleId').sort()).toEqual(
      [admin.id, staff.id, planner.id].sort(),
    );
  });

  it('says a user with no roles can do nothing', async () => {
    renderWithAction(
      <UserRolesDialog
        user={{ ...anna, accessRoles: [], combinedPermissions: [] }}
        roles={roles}
        open
        onOpenChange={vi.fn()}
      />,
    );
    const canDo = await screen.findByRole('region', { name: 'What they can do' });
    expect(within(canDo).getByText(/^Nothing\./)).toBeTruthy();
  });

  it('shows «appoint another admin first» when taking away the last admin (AC-14)', async () => {
    renderWithAction(<UserRolesDialog user={anna} roles={roles} open onOpenChange={vi.fn()} />, {
      ok: false,
      error: LAST_ADMIN,
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Save roles' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Appoint another admin first');
    expect(screen.getByRole('dialog')).toBeTruthy();
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

    expect(await screen.findByRole('dialog', { name: 'Remove Anna Kovalenko?' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
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

    expect(await screen.findByRole('dialog', { name: 'Edit name' })).toBeTruthy();
    const name = screen.getByLabelText('Name');
    // The email shows, but cannot change and is not posted.
    const email = screen.getByLabelText('Email') as HTMLInputElement;
    expect(email.value).toBe(anna.email);
    expect(email.readOnly).toBe(true);
    expect(email.name).toBe('');
    await user.clear(name);
    await user.type(name, 'Anna Koval');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect([...forms[0]!.keys()].sort()).toEqual(['intent', 'name', 'userId']);
    expect(forms[0]!.get('name')).toBe('Anna Koval');
  });
});
