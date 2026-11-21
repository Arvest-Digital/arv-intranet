import type { FreeList } from '@arv/contracts/scheduling';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoutesStub, useLocation } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { boardHref, parseBoardParams } from '../board';
import type { FreeListResult } from '../free-list';
import { mySchedule, TEAM_DELIVERY, W47, W48 } from '../test-data';
import { FreeListDrawer } from './free-list-drawer';
import { MyAllocations, MyWeekCards, NotSetUp } from './my-schedule';

afterEach(cleanup);

const H = 60;
const person = (n: number, fullName: string) => ({
  id: `01933b8e-0000-7000-8000-00000000030${n}`,
  fullName,
  team: TEAM_DELIVERY,
});

const list = (items: FreeList['items'], incompleteRecords: FreeList['incompleteRecords'] = []) => ({
  from: '2026-11-18',
  to: '2026-11-29',
  weeks: [W47, W48],
  items,
  incompleteRecords,
});

const entry = (n: number, name: string, w47: number, w48: number) => ({
  employee: person(n, name),
  freeMinutesTotal: (w47 + w48) * H,
  freeMinutesPerWeek: [
    { weekStart: W47, minutes: w47 * H },
    { weekStart: W48, minutes: w48 * H },
  ],
});

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.search}</output>;
}

function renderDrawer(result: FreeListResult, { canEdit = true, url = '/schedule?free=1' } = {}) {
  const Stub = createRoutesStub([
    {
      path: '/schedule',
      Component: () => {
        const params = parseBoardParams(new URLSearchParams(useLocation().search));
        return (
          <>
            <Where />
            {params.free ? (
              <FreeListDrawer
                params={params}
                free={params.free}
                result={result}
                canEdit={canEdit}
              />
            ) : null}
          </>
        );
      },
    },
  ]);
  render(<Stub initialEntries={[url]} />);
}

describe('who’s free drawer', () => {
  it('opens from the URL and lists the most free first with hours per week (AC-04)', () => {
    // On the wire out of order: the drawer still shows the most free first.
    renderDrawer({
      kind: 'list',
      list: list([entry(1, 'Olena Kovalenko', 8, 16), entry(2, 'Taras Melnyk', 16, 40)]),
    });
    const dialog = screen.getByRole('dialog', { name: 'Who’s free' });
    expect(
      within(dialog).getByText(/Counts from today \(Wed 18 Nov\) to the end of W48 · All teams/),
    ).toBeTruthy();
    const items = within(
      within(dialog).getByRole('list', { name: 'People with free hours, most free first' }),
    )
      .getAllByRole('listitem')
      .filter((li) => li.parentElement?.tagName === 'OL');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Taras Melnyk'),
      expect.stringContaining('Olena Kovalenko'),
    ]);
    expect(items[0]?.textContent).toContain('56h');
    expect(items[0]?.textContent).toContain('W4716h');
    expect(items[0]?.textContent).toContain('W4840h');
  });

  it('keeps the field values from the URL in the form', () => {
    renderDrawer(
      { kind: 'list', list: list([entry(1, 'Olena Kovalenko', 8, 16)]) },
      { url: '/schedule?free=1&freeWeeks=2&minFreeHours=16' },
    );
    expect((screen.getByLabelText('At least') as HTMLInputElement).value).toBe('16');
    expect((screen.getByLabelText('free hours over the next') as HTMLInputElement).value).toBe('2');
  });

  it('shows the AC-05 message, marks the field and lists nobody', () => {
    const message =
      'The number of weeks must be from 1 to 12 and the free hours must be zero or more';
    renderDrawer(
      { kind: 'invalid', message, fields: ['weeks'] },
      { url: '/schedule?free=1&freeWeeks=14&minFreeHours=16' },
    );
    expect(screen.getByRole('alert').textContent).toBe(message);
    expect(screen.getByLabelText('free hours over the next').getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(screen.getByLabelText('At least').getAttribute('aria-invalid')).toBeNull();
    expect(screen.queryByRole('list', { name: /People with free hours/ })).toBeNull();
  });

  it('lists incomplete records apart, capacity unknown (AC-06)', () => {
    renderDrawer({
      kind: 'list',
      list: list([entry(1, 'Olena Kovalenko', 8, 16)], [person(3, 'Iryna Bondar')]),
    });
    expect(screen.getByText('Left out — capacity unknown: Iryna Bondar')).toBeTruthy();
  });

  it('offers a lower minimum or more weeks when nobody is free', () => {
    renderDrawer(
      { kind: 'list', list: list([]) },
      { url: '/schedule?free=1&freeWeeks=2&minFreeHours=70' },
    );
    expect(screen.getByText('Nobody has 70 free hours in the next 2 weeks.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Show 35h or more' }).getAttribute('href')).toBe(
      '/schedule?free=1&freeWeeks=2&minFreeHours=35',
    );
    expect(screen.getByRole('link', { name: 'Look 3 weeks ahead' }).getAttribute('href')).toBe(
      '/schedule?free=1&freeWeeks=3&minFreeHours=70',
    );
  });

  it('offers «Allocate» only with edit-allocations, prefilled for the period', () => {
    const result: FreeListResult = {
      kind: 'list',
      list: list([entry(1, 'Olena Kovalenko', 8, 16)]),
    };
    renderDrawer(result, { canEdit: false });
    expect(screen.queryByRole('link', { name: /Allocate/ })).toBeNull();
    cleanup();

    renderDrawer(result, { url: '/schedule?weeks=4&free=1' });
    const allocate = screen.getByRole('link', {
      name: 'Allocate Olena Kovalenko for 18 Nov – 29 Nov',
    });
    expect(allocate.getAttribute('href')).toBe(
      '/schedule?weeks=4&allocate=01933b8e-0000-7000-8000-000000000301&allocateFrom=2026-11-18&allocateTo=2026-11-29',
    );
  });

  it('closes on Esc back to the board URL without the drawer', async () => {
    renderDrawer(
      { kind: 'list', list: list([entry(1, 'Olena Kovalenko', 8, 16)]) },
      { url: '/schedule?weeks=4&free=1&freeWeeks=2&minFreeHours=16' },
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByTestId('where').textContent).toBe('?weeks=4');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the drawer query in the board URL', () => {
    const params = parseBoardParams(
      new URLSearchParams('weeks=4&free=1&freeWeeks=3&minFreeHours=8'),
    );
    expect(params.free).toEqual({ weeks: '3', minFreeHours: '8' });
    expect(boardHref(params)).toBe('?weeks=4&free=1&freeWeeks=3&minFreeHours=8');
    expect(boardHref(params, { free: null })).toBe('?weeks=4');
  });
});

describe('my schedule', () => {
  it('shows the own leave with its type, week by week (AC-17)', () => {
    const schedule = mySchedule();
    render(<MyWeekCards schedule={schedule} currentMonday={W47} />);
    const cards = within(screen.getByRole('list', { name: 'My weeks, current week first' }))
      .getAllByRole('listitem')
      .filter((li) => li.parentElement?.tagName === 'OL');
    expect(cards).toHaveLength(2);
    expect(cards[0]?.textContent).toContain('This week');
    expect(cards[0]?.textContent).toContain('24/40');
    expect(cards[1]?.textContent).toContain('Away · 2d · Sick leave');
    expect(cards[1]?.textContent).toContain('Atlas CRM16h');
    cleanup();

    render(<MyAllocations schedule={schedule} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[1]?.textContent).toContain('Sick leave');
    expect(rows[1]?.textContent).toContain('Leave');
    expect(rows[1]?.textContent).toContain('Full working days');
    expect(rows[0]?.textContent).toContain('8h / day');
    expect(
      screen.getByText('Your schedule is read-only. Ask a planner to change an allocation.'),
    ).toBeTruthy();
  });

  it('explains a login with no employee record (AC-18)', () => {
    render(<NotSetUp />);
    expect(
      screen.getByText(
        'You’re not set up as a resource yet. Someone who manages employee records can link your login.',
      ),
    ).toBeTruthy();
  });
});
