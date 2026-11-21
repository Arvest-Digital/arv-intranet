import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PATHS } from '~/shared/paths';
import { HOLIDAY_MESSAGE, type HolidayActionResult } from '../holiday';
import { HolidayAddDialog } from './holiday-add-dialog';

afterEach(cleanup);

function renderWithAction(ui: React.ReactNode, ...answers: HolidayActionResult[]) {
  const forms: FormData[] = [];
  const Stub = createRoutesStub([
    {
      path: PATHS.holidays,
      Component: () => ui,
      action: async ({ request }) => {
        forms.push(await request.formData());
        return answers[Math.min(forms.length, answers.length) - 1];
      },
    },
  ]);
  render(<Stub initialEntries={[PATHS.holidays]} />);
  return forms;
}

const confirm: HolidayActionResult = {
  ok: false,
  kind: 'confirm',
  weeks: [
    { employeeName: 'Olena Kovalenko', weekStart: '2026-12-21', overMinutes: 480 },
    { employeeName: 'Marko Ivanov', weekStart: '2026-12-21', overMinutes: 240 },
  ],
};

async function fill(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await screen.findByRole('dialog', { name: 'Add holiday' });
  await user.type(within(dialog).getByLabelText('Date'), '2026-12-25');
  await user.type(within(dialog).getByLabelText('Name'), 'Christmas Day');
  return dialog;
}

describe('HolidayAddDialog', () => {
  it('lists the weeks it would overbook and adds only once confirmed (AC-27, AC-19c)', async () => {
    const onAdded = vi.fn();
    const forms = renderWithAction(
      <HolidayAddDialog open onOpenChange={() => {}} onAdded={onAdded} />,
      confirm,
      { ok: true, intent: 'add', holidayDate: '2026-12-25' },
    );
    const user = userEvent.setup();
    const dialog = await fill(user);
    expect(within(dialog).getByText('Fri 25 Dec 2026')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Add holiday' }));

    const impact = await screen.findByRole('alertdialog');
    expect(
      within(impact).getByRole('heading', { name: 'Adding 25 Dec makes 2 weeks overbooked' }),
    ).toBeTruthy();
    expect(within(impact).getByText('Olena Kovalenko')).toBeTruthy();
    expect(within(impact).getByText('+8h')).toBeTruthy();
    expect(within(impact).getByText('Allocations are not changed.')).toBeTruthy();
    expect(onAdded).not.toHaveBeenCalled();
    expect(forms[0]!.get('confirm')).toBeNull();

    await user.click(within(impact).getByRole('button', { name: 'Add anyway' }));
    await waitFor(() => expect(forms).toHaveLength(2));
    expect(forms[1]!.get('confirm')).toBe('true');
    expect(forms[1]!.get('holidayDate')).toBe('2026-12-25');
    expect(forms[1]!.get('name')).toBe('Christmas Day');
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith('2026-12-25'));
  });

  it('goes back to the form without adding', async () => {
    const forms = renderWithAction(<HolidayAddDialog open onOpenChange={() => {}} />, confirm);
    const user = userEvent.setup();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Add holiday' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Back' }),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByLabelText('Name')).toBeTruthy();
    expect(forms).toHaveLength(1);
  });

  it('shows a date already on the list under the date', async () => {
    renderWithAction(<HolidayAddDialog open onOpenChange={() => {}} />, {
      ok: false,
      kind: 'invalid',
      fieldErrors: { holidayDate: HOLIDAY_MESSAGE.duplicate('2026-12-25') },
    });
    const user = userEvent.setup();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Add holiday' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      '2026-12-25 is already a public holiday',
    );
    expect(screen.getByLabelText('Date').getAttribute('aria-invalid')).toBe('true');
  });
});
