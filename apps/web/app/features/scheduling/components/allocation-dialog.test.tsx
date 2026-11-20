import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALLOCATION_MESSAGE, type AllocationActionResult } from '../allocation';
import type { FilterOption } from '../board';
import { ATLAS, allocation, COBALT, W47, W48 } from '../test-data';
import { AllocationDialog, type AllocationDialogState, type Resource } from './allocation-dialog';

afterEach(cleanup);

const TODAY = '2026-11-18';
const OLENA: Resource = {
  id: '01933b8e-0000-7000-8000-000000000301',
  fullName: 'Olena Kovalenko',
  team: 'Platform',
};
const OPEN: ReadonlyArray<FilterOption> = [
  { ...ATLAS, status: 'open' },
  { ...COBALT, status: 'open' },
];

/** Renders the dialog on /schedule, with the allocation action answering `answers` in turn. */
function renderDialog(
  state: AllocationDialogState,
  answers: AllocationActionResult[],
  projects: ReadonlyArray<FilterOption> = OPEN,
) {
  const forms: FormData[] = [];
  const onDone = vi.fn();
  const Stub = createRoutesStub([
    {
      path: '/schedule',
      Component: () => (
        <AllocationDialog
          state={state}
          resources={[OLENA]}
          projects={projects}
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

/** Atlas CRM for Olena: 8h a day from W47 (started before today, so its start is locked). */
const atlasForOlena = () => ({
  allocation: {
    ...allocation(ATLAS, [
      [W47, 40],
      [W48, 40],
    ]),
    version: 3,
  },
  employeeName: OLENA.fullName,
  employmentEnd: null,
});

const overbooked: AllocationActionResult = {
  ok: false,
  kind: 'confirm',
  weeks: [{ weekStart: W48, capacityMinutes: 2400, allocatedMinutes: 2880, overMinutes: 480 }],
  onLeave: [],
};

describe('AllocationDialog: create', () => {
  it('sends the person, open project, dates and hours (AC-07)', async () => {
    const { forms, onDone } = renderDialog(
      { mode: 'create', employeeId: OLENA.id, startsOn: W48, endsOn: '2026-12-04' },
      [{ ok: true, intent: 'create', allocationId: 'a1' }],
      [...OPEN, { id: 'closed', name: 'Old site', type: 'client', status: 'closed' }],
    );
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog', { name: 'New allocation' });
    await user.click(within(dialog).getByLabelText('Project'));
    // Closed projects are not offered (AC-11).
    expect(screen.queryByRole('option', { name: 'Old site' })).toBeNull();
    await user.click(await screen.findByRole('option', { name: 'Cobalt billing' }));
    await user.type(within(dialog).getByLabelText('Rate'), '20');
    await user.click(within(dialog).getByRole('button', { name: 'Create allocation' }));
    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith('Allocated Olena Kovalenko to Cobalt billing.'),
    );
    expect(Object.fromEntries(forms[0]!)).toMatchObject({
      intent: 'create',
      employeeId: OLENA.id,
      projectId: COBALT.id,
      startsOn: W48,
      endsOn: '2026-12-04',
      rate: '20',
      ratePeriod: 'week',
    });
    expect(forms[0]!.has('confirm')).toBe(false);
  });

  it('shows the rules the input breaks before sending (AC-09)', async () => {
    const { forms } = renderDialog(
      { mode: 'create', employeeId: OLENA.id, startsOn: '2027-01-04', endsOn: null },
      [],
    );
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog', { name: 'New allocation' });
    await user.type(within(dialog).getByLabelText('End'), '2026-12-31');
    await user.click(within(dialog).getByRole('button', { name: 'per day' }));
    await user.type(within(dialog).getByLabelText('Rate'), '26.1');
    await user.click(within(dialog).getByRole('button', { name: 'Create allocation' }));
    const text = within(dialog)
      .getAllByRole('alert')
      .map((a) => a.textContent);
    expect(text).toEqual([
      ALLOCATION_MESSAGE.project,
      'End date is before start date',
      'Hours must be a multiple of 0.25More than 24h per day',
    ]);
    expect(within(dialog).getByLabelText('Rate').getAttribute('aria-invalid')).toBe('true');
    expect(forms).toHaveLength(0);
  });

  it('says the permission is missing and nothing changed (AC-12)', async () => {
    renderDialog({ mode: 'create', employeeId: OLENA.id, startsOn: W48, endsOn: '2026-12-04' }, [
      { ok: false, kind: 'error', error: ALLOCATION_MESSAGE.forbidden },
    ]);
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog', { name: 'New allocation' });
    await user.click(within(dialog).getByLabelText('Project'));
    await user.click(await screen.findByRole('option', { name: 'Atlas CRM' }));
    await user.type(within(dialog).getByLabelText('Rate'), '8');
    await user.click(within(dialog).getByRole('button', { name: 'Create allocation' }));
    expect(await within(dialog).findByText(ALLOCATION_MESSAGE.forbidden)).toBeTruthy();
  });
});

describe('AllocationDialog: edit', () => {
  it('lists the weeks over capacity and saves only once confirmed (AC-10)', async () => {
    const { forms, onDone } = renderDialog({ mode: 'edit', target: atlasForOlena() }, [
      overbooked,
      { ok: true, intent: 'change', allocationId: 'a1' },
    ]);
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog', { name: 'Edit allocation' });
    // Started before today: the start is locked and the change applies from today (AC-09b).
    expect(within(dialog).getByLabelText('Start').hasAttribute('readonly')).toBe(true);
    expect(within(dialog).getByText(/Changes apply from today \(18 Nov\)/)).toBeTruthy();
    const rate = within(dialog).getByLabelText('Rate');
    await user.clear(rate);
    await user.type(rate, '10');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    const confirm = await screen.findByRole('alertdialog', {
      name: 'Olena will be overbooked in 1 week',
    });
    const row = within(confirm).getByRole('row', { name: /W48/ });
    expect(row.textContent).toBe('W48 · 23 Nov40h48h+8h');
    expect(forms[0]!.get('confirm')).toBeNull();
    expect(forms[0]!.has('startsOn')).toBe(false);
    expect(forms[0]!.get('version')).toBe('3');

    await user.click(within(confirm).getByRole('button', { name: 'Save anyway' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(forms[1]!.get('confirm')).toBe('true');
    expect(forms[1]!.get('rate')).toBe('10');
    expect(forms[1]!.get('ratePeriod')).toBe('day');
  });

  it('shows the other user’s values and re-applies at their version (AC-07b)', async () => {
    const { forms } = renderDialog({ mode: 'edit', target: atlasForOlena() }, [
      {
        ok: false,
        kind: 'conflict',
        message: 'Marko Ivanov changed this allocation meanwhile',
        version: 4,
        changedBy: 'Marko Ivanov',
        changedAt: '2026-11-18T14:32:00.000Z',
        current: {
          projectName: 'Atlas CRM',
          startsOn: W47,
          endsOn: '2027-01-15',
          rateMinutes: 960,
          ratePeriod: 'week',
        },
      },
      { ok: true, intent: 'change', allocationId: 'a1' },
    ]);
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog', { name: 'Edit allocation' });
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    const conflict = await screen.findByRole('alertdialog', { name: 'Your changes weren’t saved' });
    expect(
      within(conflict).getByText(
        'Marko Ivanov changed this allocation at 14:32 while you were editing.',
      ),
    ).toBeTruthy();
    const end = within(conflict).getByRole('row', { name: /End/ });
    expect(end.textContent).toBe('End2027-01-152026-11-29');
    expect(end.getAttribute('data-differs')).toBe('true');
    expect(within(conflict).getByRole('row', { name: /Rate/ }).textContent).toBe(
      'Rate16h / week8h / day',
    );

    await user.click(within(conflict).getByRole('button', { name: 'Re-apply my changes' }));
    await waitFor(() => expect(forms).toHaveLength(2));
    expect(forms[1]!.get('version')).toBe('4');
  });

  it('puts the api’s rule errors under their fields (AC-09, AC-13)', async () => {
    renderDialog({ mode: 'edit', target: atlasForOlena() }, [
      {
        ok: false,
        kind: 'invalid',
        fieldErrors: {
          endsOn: [ALLOCATION_MESSAGE.outsideEmployment('2026-12-15')],
          rate: [ALLOCATION_MESSAGE.rules.hours_over_24_per_working_day],
        },
      },
    ]);
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog', { name: 'Edit allocation' });
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(
      await within(dialog).findByText(
        'The range ends after the employment period — the last date to allocate is 15 Dec 2026.',
      ),
    ).toBeTruthy();
    expect(within(dialog).getByLabelText('End').getAttribute('aria-invalid')).toBe('true');
    expect(within(dialog).getByLabelText('Rate').getAttribute('aria-invalid')).toBe('true');
  });

  it('refuses to edit an allocation of a closed project (AC-11)', async () => {
    renderDialog({ mode: 'edit', target: atlasForOlena() }, [], [{ ...ATLAS, status: 'closed' }]);
    const dialog = await screen.findByRole('dialog', { name: 'Edit allocation' });
    expect(
      within(dialog).getByText(
        'Atlas CRM is closed and accepts no new, changed or removed allocations.',
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole('button', { name: 'Save changes' }).hasAttribute('disabled'),
    ).toBe(true);
  });
});

describe('AllocationDialog: remove', () => {
  it('ends a started allocation yesterday, at the opened version (AC-07a, AC-09b)', async () => {
    const { forms, onDone } = renderDialog({ mode: 'remove', target: atlasForOlena() }, [
      { ok: true, intent: 'remove', outcome: 'ended', endsOn: '2026-11-17' },
    ]);
    const user = userEvent.setup();
    const confirm = await screen.findByRole('alertdialog', { name: 'Remove allocation?' });
    expect(
      within(confirm).getByText(
        'The allocation will end yesterday (17 Nov). Hours before today stay booked.',
      ),
    ).toBeTruthy();
    expect(within(confirm).getByText('It stays in the allocation history.')).toBeTruthy();
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith('Atlas CRM for Olena Kovalenko ends on 17 Nov 2026.'),
    );
    expect(Object.fromEntries(forms[0]!)).toMatchObject({ intent: 'remove', version: '3' });
  });

  it('deletes one that has not started', async () => {
    const target = atlasForOlena();
    const future = {
      ...target,
      allocation: {
        ...target.allocation,
        segments: [
          {
            startsOn: '2027-01-18',
            endsOn: '2027-01-29',
            rateMinutes: 480,
            ratePeriod: 'day' as const,
          },
        ],
      },
    };
    renderDialog({ mode: 'remove', target: future }, []);
    const confirm = await screen.findByRole('alertdialog', { name: 'Remove allocation?' });
    expect(within(confirm).getByText('The allocation will be deleted.')).toBeTruthy();
    expect(within(confirm).getByText(/8h \/ day from 18 Jan 2027/)).toBeTruthy();
  });

  it('says the permission is missing (AC-12)', async () => {
    renderDialog({ mode: 'remove', target: atlasForOlena() }, [
      { ok: false, kind: 'error', error: ALLOCATION_MESSAGE.forbidden },
    ]);
    const user = userEvent.setup();
    const confirm = await screen.findByRole('alertdialog', { name: 'Remove allocation?' });
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }));
    expect(await within(confirm).findByText(ALLOCATION_MESSAGE.forbidden)).toBeTruthy();
  });
});
