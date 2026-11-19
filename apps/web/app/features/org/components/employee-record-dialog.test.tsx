import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type EmployeeRecordActionResult, RULE_MESSAGE } from '../employee-record';
import { kateryna, logins, olena, teams } from '../test-data';
import { EmployeeRecordDialog } from './employee-record-dialog';

afterEach(cleanup);

/** Renders `ui` on a route whose action records each submitted form and answers in turn. */
function renderWithAction(ui: React.ReactNode, ...answers: EmployeeRecordActionResult[]) {
  const forms: FormData[] = [];
  const Stub = createRoutesStub([
    {
      path: '/people',
      Component: () => ui,
      action: async ({ request }) => {
        forms.push(await request.formData());
        return answers[Math.min(forms.length, answers.length) - 1];
      },
    },
  ]);
  render(<Stub initialEntries={['/people']} />);
  return forms;
}

const saved: EmployeeRecordActionResult = {
  ok: true,
  id: olena.id,
  fullName: olena.fullName,
  employmentEnd: null,
};

const dialogProps = { teams, logins, open: true, onOpenChange: () => {} };

describe('EmployeeRecordDialog', () => {
  it('posts a new record with its working days, and shows the capacity (AC-19a, AC-19)', async () => {
    const onSaved = vi.fn();
    const forms = renderWithAction(
      <EmployeeRecordDialog {...dialogProps} onSaved={onSaved} />,
      saved,
    );
    const user = userEvent.setup();

    const dialog = await screen.findByRole('dialog', { name: 'New employee record' });
    await user.type(within(dialog).getByLabelText('Full name'), 'Nadiia Moroz');
    await user.type(within(dialog).getByLabelText('Contract hours per week'), '24');
    // Mon–Fri by default; leave Mon–Wed.
    await user.click(within(dialog).getByRole('button', { name: 'Thu' }));
    await user.click(within(dialog).getByRole('button', { name: 'Fri' }));
    expect(within(dialog).getByText('8h')).toBeTruthy();
    expect(within(dialog).getByText('24h')).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: 'Create record' }));
    await waitFor(() => expect(forms).toHaveLength(1));
    expect(forms[0]!.get('intent')).toBe('create');
    expect(forms[0]!.get('fullName')).toBe('Nadiia Moroz');
    expect(forms[0]!.get('contractHours')).toBe('24');
    expect(forms[0]!.getAll('workingDay')).toEqual(['1', '2', '3']);
    expect(forms[0]!.get('teamId')).toBe('none');
    expect(forms[0]!.get('userId')).toBe('none');
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
  });

  it('shows each broken rule under its field (AC-20)', async () => {
    renderWithAction(<EmployeeRecordDialog {...dialogProps} record={kateryna} />, {
      ok: false,
      kind: 'invalid',
      fieldErrors: {
        contractHours: RULE_MESSAGE.contractHours,
        workingDays: RULE_MESSAGE.workingDays,
        employmentEnd: RULE_MESSAGE.endBeforeStart,
      },
    });
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog', { name: 'Edit employee record' });
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    const hours = within(dialog).getByLabelText('Contract hours per week');
    await waitFor(() => expect(hours.getAttribute('aria-invalid')).toBe('true'));
    expect(document.getElementById(hours.getAttribute('aria-describedby')!)!.textContent).toBe(
      RULE_MESSAGE.contractHours,
    );
    const end = within(dialog).getByLabelText(/Employment end/);
    expect(document.getElementById(end.getAttribute('aria-describedby')!)!.textContent).toBe(
      RULE_MESSAGE.endBeforeStart,
    );
    const days = within(dialog).getByRole('group', { name: 'Working days' });
    expect(document.getElementById(days.getAttribute('aria-describedby')!)!.textContent).toBe(
      RULE_MESSAGE.workingDays,
    );
    // Still open: nothing was saved.
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('says which record a login is already linked to (AC-19b)', async () => {
    const message = RULE_MESSAGE.loginLinked('Marko Ivanov');
    renderWithAction(<EmployeeRecordDialog {...dialogProps} record={kateryna} />, {
      ok: false,
      kind: 'invalid',
      fieldErrors: { userId: message },
    });
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toBe(message);
    const login = within(dialog).getByLabelText('Linked intranet login');
    expect(login.getAttribute('aria-invalid')).toBe('true');
  });

  it('lists the overbooked weeks and resubmits the same form with confirm (AC-19c)', async () => {
    const onSaved = vi.fn();
    const forms = renderWithAction(
      <EmployeeRecordDialog {...dialogProps} record={olena} onSaved={onSaved} />,
      {
        ok: false,
        kind: 'confirm',
        weeks: [
          { employeeName: olena.fullName, weekStart: '2026-11-23', overMinutes: 480 },
          { employeeName: olena.fullName, weekStart: '2026-11-30', overMinutes: 120 },
        ],
      },
      saved,
    );
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog', { name: 'Edit employee record' });
    const hours = within(dialog).getByLabelText('Contract hours per week');
    await user.clear(hours);
    await user.type(hours, '24');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await within(dialog).findByText('These weeks will become overbooked')).toBeTruthy();
    expect(
      within(dialog).getByText('Olena Kovalenko · contract hours 40h → 24h per week'),
    ).toBeTruthy();
    expect(within(dialog).getByText('W48 · 23 Nov')).toBeTruthy();
    expect(within(dialog).getByText('+8h')).toBeTruthy();
    expect(within(dialog).getByText('+2h')).toBeTruthy();
    expect(within(dialog).getByText('Allocations are not changed.')).toBeTruthy();
    expect(forms[0]!.get('confirm')).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Save anyway' }));
    await waitFor(() => expect(forms).toHaveLength(2));
    expect(forms[1]!.get('confirm')).toBe('true');
    expect(forms[1]!.get('version')).toBe('3');
    expect(forms[1]!.get('contractHours')).toBe('24');
    expect(forms[1]!.get('employeeRecordId')).toBe(olena.id);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
  });

  it('goes back to the form from the confirmation without saving (AC-19c)', async () => {
    const forms = renderWithAction(<EmployeeRecordDialog {...dialogProps} record={olena} />, {
      ok: false,
      kind: 'confirm',
      weeks: [{ employeeName: olena.fullName, weekStart: '2026-11-23', overMinutes: 480 }],
    });
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await user.click(await within(dialog).findByRole('button', { name: 'Back' }));

    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeTruthy();
    expect(forms).toHaveLength(1);
  });

  it('shows the values someone saved meanwhile and edits on top of them', async () => {
    const current = { ...olena, version: 4, contractMinutes: 1920 };
    const forms = renderWithAction(
      <EmployeeRecordDialog {...dialogProps} record={olena} />,
      { ok: false, kind: 'conflict', error: 'Marko Ivanov changed this record meanwhile', current },
      saved,
    );
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(
      await within(dialog).findByText('Marko Ivanov changed this record meanwhile. Their values:'),
    ).toBeTruthy();
    expect(within(dialog).getByText('32h per week')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Edit their version' }));

    const hours = within(dialog).getByLabelText('Contract hours per week') as HTMLInputElement;
    expect(hours.value).toBe('32');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(forms).toHaveLength(2));
    expect(forms[1]!.get('version')).toBe('4');
  });

  it('keeps the login as it is when the access list cannot be read', async () => {
    const forms = renderWithAction(
      <EmployeeRecordDialog {...dialogProps} logins={null} record={olena} />,
      saved,
    );
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog');
    expect((within(dialog).getByLabelText('Linked intranet login') as HTMLInputElement).value).toBe(
      'Linked',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(forms).toHaveLength(1));
    expect(forms[0]!.has('userId')).toBe(false);
  });
});
