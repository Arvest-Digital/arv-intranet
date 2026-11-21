import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALLOCATION_MESSAGE, type AllocationActionResult } from '../allocation';
import type { FilterOption } from '../board';
import { ATLAS, COBALT, SICK } from '../test-data';
import type { Resource } from './allocation-dialog';
import { LeaveDialog, type LeaveDialogState, leaveDays } from './leave-dialog';

afterEach(cleanup);

const TODAY = '2026-11-18';
const SOFIA: Resource = {
  id: '01933b8e-0000-7000-8000-000000000302',
  fullName: 'Sofia Lys',
  team: 'Design',
};
const ANNUAL: FilterOption = {
  id: '01933b8e-0000-7000-8000-000000000508',
  name: 'Annual leave',
  type: 'leave',
  status: 'open',
};
const PROJECTS: ReadonlyArray<FilterOption> = [
  { ...ATLAS, status: 'open' },
  ANNUAL,
  { ...SICK, status: 'open' },
  {
    id: '01933b8e-0000-7000-8000-000000000507',
    name: 'Old leave',
    type: 'leave',
    status: 'closed',
  },
];

/** Renders the dialog on /schedule, with the allocation action answering `answers` in turn. */
function renderDialog(state: LeaveDialogState, answers: AllocationActionResult[]) {
  const forms: FormData[] = [];
  const onDone = vi.fn();
  const Stub = createRoutesStub([
    {
      path: '/schedule',
      Component: () => (
        <LeaveDialog
          state={state}
          resources={[SOFIA]}
          projects={PROJECTS}
          today={TODAY}
          onOpenChange={() => {}}
          onDone={onDone}
        />
      ),
    },
    {
      path: '/schedule/allocations',
      action: async ({ request }) => {
        forms.push(await request.formData());
        return answers[Math.min(forms.length, answers.length) - 1] ?? null;
      },
    },
  ]);
  render(<Stub initialEntries={['/schedule']} />);
  return { forms, onDone };
}

/** Fills the dates and books. */
async function book(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  const start = within(dialog).getByLabelText('Start');
  await user.clear(start);
  await user.type(start, '2026-11-30');
  await user.type(within(dialog).getByLabelText('End'), '2026-12-02');
  await user.click(within(dialog).getByRole('button', { name: 'Book leave' }));
}

const workOnLeave: AllocationActionResult = {
  ok: false,
  kind: 'confirm',
  weeks: [
    { weekStart: '2026-11-30', capacityMinutes: 2400, allocatedMinutes: 3360, overMinutes: 960 },
  ],
  onLeave: [
    { projectId: ATLAS.id, projectName: 'Atlas CRM', days: ['2026-11-30', '2026-12-01'] },
    { projectId: COBALT.id, projectName: 'Cobalt billing', days: ['2026-12-02'] },
  ],
};

describe('LeaveDialog (AC-15)', () => {
  it('books whole days of an open leave type, with no hours input', async () => {
    const { forms, onDone } = renderDialog({ employeeId: SOFIA.id }, [
      { ok: true, intent: 'leave', allocationId: 'a1' },
    ]);
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog', { name: 'Book leave' });
    expect(within(dialog).queryByLabelText('Rate')).toBeNull();

    await user.click(within(dialog).getByLabelText('Leave type'));
    // Only open leave projects: no work project, no closed leave type.
    expect(screen.queryByRole('option', { name: 'Atlas CRM' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Old leave' })).toBeNull();
    await user.click(await screen.findByRole('option', { name: 'Sick leave' }));
    await book(user, dialog);

    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith('Sick leave booked for Sofia Lys: 30 Nov – 2 Dec 2026.'),
    );
    expect(Object.fromEntries(forms[0]!)).toEqual({
      intent: 'leave',
      employeeId: SOFIA.id,
      projectId: SICK.id,
      startsOn: '2026-11-30',
      endsOn: '2026-12-02',
      projectName: 'Sick leave',
    });
  });

  it('names the work allocations on the leave days, then books anyway with confirm', async () => {
    const { forms, onDone } = renderDialog({ employeeId: SOFIA.id }, [
      workOnLeave,
      { ok: true, intent: 'leave', allocationId: 'a1' },
    ]);
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog', { name: 'Book leave' });
    await book(user, dialog);

    const confirm = await screen.findByRole('alertdialog', {
      name: 'Sofia has work planned on the leave days',
    });
    const work = within(confirm).getByRole('list', { name: 'Work on leave days' });
    expect(
      within(work)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Atlas CRM — Mon 30 Nov, Tue 1 Dec', 'Cobalt billing — Wed 2 Dec']);
    expect(within(confirm).getByText('W49 · 30 Nov')).toBeTruthy();
    expect(within(confirm).getByText('+16h')).toBeTruthy();
    expect(forms[0]!.has('confirm')).toBe(false);

    await user.click(within(confirm).getByRole('button', { name: 'Book anyway' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(forms[1]!.get('confirm')).toBe('true');
    expect(forms[1]!.get('projectId')).toBe(ANNUAL.id);
  });

  it('goes back to the form from the confirm, keeping the values', async () => {
    renderDialog({ employeeId: SOFIA.id }, [workOnLeave]);
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog', { name: 'Book leave' });
    await book(user, dialog);
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Back' }));
    expect((within(dialog).getByLabelText('End') as HTMLInputElement).value).toBe('2026-12-02');
  });

  it('shows plain mistakes before sending, and the api’s rules under their fields', async () => {
    const { forms } = renderDialog({ employeeId: null }, [
      {
        ok: false,
        kind: 'invalid',
        fieldErrors: { endsOn: [ALLOCATION_MESSAGE.outsideEmployment('2026-12-01')] },
      },
    ]);
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog', { name: 'Book leave' });
    await user.click(within(dialog).getByRole('button', { name: 'Book leave' }));
    expect(
      within(dialog)
        .getAllByRole('alert')
        .map((a) => a.textContent),
    ).toEqual([ALLOCATION_MESSAGE.employee, ALLOCATION_MESSAGE.date]);
    expect(forms).toHaveLength(0);

    await user.click(within(dialog).getByLabelText('Resource'));
    await user.click(await screen.findByRole('option', { name: /Sofia Lys/ }));
    await book(user, dialog);
    expect(
      await within(dialog).findByText(
        'The range ends after the employment period — the last date to allocate is 1 Dec 2026.',
      ),
    ).toBeTruthy();
  });

  it('lists the weekdays and the weekends it skips', () => {
    expect(leaveDays('2026-12-23', '2026-12-28')).toEqual({
      weekdays: ['2026-12-23', '2026-12-24', '2026-12-25', '2026-12-28'],
      weekends: [{ from: '2026-12-26', to: '2026-12-27' }],
    });
    expect(leaveDays('2026-12-28', '2026-12-23')).toBeNull();
  });
});
