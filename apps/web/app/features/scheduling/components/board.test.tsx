import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PATHS } from '~/shared/paths';
import { parseBoardParams } from '../board';
import { allocation, board, COBALT, cell, everyStateBoard, row, W47, W48 } from '../test-data';
import type { AllocationDialogState } from './allocation-dialog';
import { AllocationEditingContext } from './allocation-popover';
import { ProjectGrid } from './board-by-project';
import { PeopleGrid } from './board-grid';
import { BoardLegend } from './board-legend';
import { BoardForbidden } from './board-states';
import { BoardToolbar } from './board-toolbar';

afterEach(cleanup);

function renderAt(element: React.ReactNode, url = '/schedule') {
  const Stub = createRoutesStub([{ path: '/schedule', Component: () => element }]);
  render(<Stub initialEntries={[url]} />);
}

describe('board by people', () => {
  it('gives every cell state its text label and figure (AC-01, AC-06, QS-7)', () => {
    renderAt(<PeopleGrid board={everyStateBoard()} currentMonday={W47} />);
    const table = screen.getByRole('table', { name: 'Team schedule, one column per week' });
    const cells = [...table.querySelectorAll('[data-state]')];
    // People by name within a team: Andrii, Olena, Taras; then «No team»: Iryna.
    expect(cells.map((c) => c.getAttribute('data-state'))).toEqual([
      'needs-attention',
      'partly-booked',
      'free',
      'partly-booked',
      'overbooked',
      'fully-booked',
      'non-working',
      'incomplete-record',
    ]);
    const labels: Record<string, string> = {
      free: 'Free',
      'partly-booked': 'Partly booked',
      'fully-booked': 'Fully booked',
      overbooked: 'Overbooked',
      'non-working': 'Non-working',
      'incomplete-record': 'Incomplete record',
      'needs-attention': 'Needs attention',
    };
    for (const c of cells) {
      expect(c.textContent).toContain(labels[c.getAttribute('data-state') ?? '']);
    }
    expect(cells[4]?.textContent).toContain('48/40');
    expect(cells[4]?.textContent).toContain('+8h over');
    expect(cells[1]?.textContent).toContain('Away · 2d');
    expect(cells[7]?.textContent).toContain('Capacity unknown');
  });

  it('groups by team with weekly totals, «No team» last', () => {
    renderAt(<PeopleGrid board={everyStateBoard()} currentMonday={W47} />);
    const groupHeaders = screen
      .getAllByRole('rowheader')
      .filter((h) => h.getAttribute('scope') === 'rowgroup');
    expect(groupHeaders.map((h) => h.textContent)).toEqual(['Delivery3 people', 'No team1 person']);
    expect(screen.getByText('64/80')).toBeTruthy();
    expect(screen.getByText('1 over')).toBeTruthy();
  });

  it('expands a person into their allocations as project blocks', async () => {
    renderAt(<PeopleGrid board={everyStateBoard()} currentMonday={W47} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Show allocations for Taras Melnyk' }),
    );
    expect(screen.getByRole('rowheader', { name: /Cobalt billing/ })).toBeTruthy();
    expect(screen.getByTitle('Cobalt billing, W48 2026: 16h')).toBeTruthy();
  });

  it('lists the hours per project inside the 1-week cell', () => {
    const one = board(
      [
        row(
          1,
          'Taras Melnyk',
          [cell(W47, 'overbooked', 48, 40)],
          [allocation(COBALT, [[W47, 24]]), allocation(null, [[W47, 24]], true)],
        ),
      ],
      [W47],
    );
    renderAt(<PeopleGrid board={one} currentMonday={W47} />);
    const list = screen.getByRole('list', { name: 'Allocations for Taras Melnyk this week' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Cobalt billingClient24h', 'Away24h']);
    expect(screen.getByText('Overbooked')).toBeTruthy();
  });
});

describe('board by project (AC-02b)', () => {
  it('totals projects per week and puts redacted leave in one «Away» group', () => {
    const b = board([
      row(
        1,
        'Olena Kovalenko',
        [cell(W47, 'partly-booked', 8, 40, 1), cell(W48, 'free', 0, 40)],
        [allocation(null, [[W47, 8]], true)],
      ),
      row(
        2,
        'Taras Melnyk',
        [cell(W47, 'partly-booked', 40, 40, 3), cell(W48, 'free', 0, 40)],
        [allocation(COBALT, [[W47, 16]]), allocation(null, [[W47, 24]], true)],
      ),
    ]);
    renderAt(<ProjectGrid board={b} currentMonday={W47} />);
    const groupHeaders = screen
      .getAllByRole('rowheader')
      .filter((h) => h.getAttribute('scope') === 'rowgroup');
    expect(groupHeaders.map((h) => h.textContent)).toEqual([
      'Cobalt billingClient1 person',
      'Away2 people',
    ]);
    expect(screen.getByTitle('Cobalt billing, W47 2026: 16h booked')).toBeTruthy();
    expect(screen.getByText('4d away')).toBeTruthy();
    expect(screen.getByText('Away · 3d')).toBeTruthy();
    // Hours on the project beside the whole-week state.
    const cobalt = screen.getByRole('cell', { name: /Taras Melnyk, W47 2026: Cobalt billing 16h/ });
    expect(cobalt.textContent).toContain('Fully booked');
    expect(cobalt.textContent).toContain('40/40');
  });
});

describe('board screens', () => {
  it('offers the own schedule when the board is refused (AC-03)', () => {
    renderAt(<BoardForbidden />);
    expect(screen.getByText("You don't have permission to view the team schedule")).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open my schedule' }).getAttribute('href')).toBe(
      PATHS.mySchedule,
    );
  });

  it('keeps every control in the URL', () => {
    const params = parseBoardParams(new URLSearchParams('weeks=4'));
    renderAt(
      <BoardToolbar
        params={params}
        from={W47}
        weeks={[W47, W48, '2026-11-30', '2026-12-07']}
        today="2026-11-19"
        teams={[]}
        projects={[]}
        canSeeLeaveReasons={false}
      />,
      '/schedule?weeks=4',
    );
    const zoom = screen.getByRole('navigation', { name: 'Zoom: number of week columns' });
    expect(
      within(zoom)
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')]),
    ).toEqual([
      ['1 week', '/schedule?weeks=1'],
      ['4 weeks', '/schedule?weeks=4'],
      ['12 weeks', '/schedule'],
    ]);
    expect(within(zoom).getByRole('link', { name: '4 weeks' }).getAttribute('aria-current')).toBe(
      'true',
    );
    expect(screen.getByRole('link', { name: 'By project' }).getAttribute('href')).toBe(
      '/schedule?weeks=4&view=project',
    );
    expect(screen.getByRole('link', { name: 'Next week' }).getAttribute('href')).toBe(
      `/schedule?from=${W48}&weeks=4`,
    );
    // Already on the current week.
    expect(screen.getByRole('button', { name: 'Today' })).toHaveProperty('disabled', true);
  });

  it('lists «Needs attention» only for viewers who may see the mark (AC-22)', () => {
    renderAt(<BoardLegend showAttention={false} />);
    expect(screen.queryByText('Needs attention')).toBeNull();
    cleanup();
    renderAt(<BoardLegend showAttention />);
    expect(screen.getByText('Needs attention')).toBeTruthy();
  });
});

describe('board editing (US-03)', () => {
  const editing = (
    open: (state: AllocationDialogState) => void,
    canEdit = true,
    openHistory = vi.fn(),
  ) => ({
    canEdit,
    today: '2026-11-18',
    open,
    openHistory,
  });

  it('opens an allocation’s details from its block, then Edit or Remove', async () => {
    const open = vi.fn();
    renderAt(
      <AllocationEditingContext.Provider value={editing(open)}>
        <PeopleGrid board={everyStateBoard()} currentMonday={W47} />
      </AllocationEditingContext.Provider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Show allocations for Taras Melnyk' }));
    await user.click(
      screen.getByRole('button', { name: 'Cobalt billing, 24h in W47 2026. Open details' }),
    );
    const details = await screen.findByRole('dialog', { name: 'Cobalt billing' });
    // AC-07: who changed it last; the week's overbooking from the cell.
    expect(within(details).getByText('Marko Ivanov · 10 Nov 2026, 09:00')).toBeTruthy();
    expect(
      within(details).getByText('Taras is 8h over capacity in W47 2026 (48/40).'),
    ).toBeTruthy();
    await user.click(within(details).getByRole('button', { name: 'Edit' }));
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'edit',
        target: expect.objectContaining({ employeeName: 'Taras Melnyk' }),
      }),
    );
  });

  it('opens an allocation’s history from its details, for viewers too (US-05)', async () => {
    const openHistory = vi.fn();
    renderAt(
      <AllocationEditingContext.Provider value={editing(vi.fn(), false, openHistory)}>
        <PeopleGrid board={everyStateBoard()} currentMonday={W47} />
      </AllocationEditingContext.Provider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Show allocations for Taras Melnyk' }));
    await user.click(
      screen.getByRole('button', { name: 'Cobalt billing, 24h in W47 2026. Open details' }),
    );
    const details = await screen.findByRole('dialog', { name: 'Cobalt billing' });
    expect(within(details).queryByRole('button', { name: 'Edit' })).toBeNull();
    await user.click(within(details).getByRole('button', { name: 'History' }));
    expect(openHistory).toHaveBeenCalledWith(
      expect.objectContaining({ employeeName: 'Taras Melnyk' }),
    );
  });

  it('offers «New allocation» from a person’s week cell, not to viewers', async () => {
    const open = vi.fn();
    renderAt(
      <AllocationEditingContext.Provider value={editing(open)}>
        <PeopleGrid board={everyStateBoard()} currentMonday={W47} />
      </AllocationEditingContext.Provider>,
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'New allocation for Olena Kovalenko from W48 2026' }),
    );
    expect(open).toHaveBeenCalledWith({
      mode: 'create',
      employeeId: '01933b8e-0000-7000-8000-000000000301',
      startsOn: W48,
      endsOn: null,
    });
    cleanup();
    renderAt(
      <AllocationEditingContext.Provider value={editing(open, false)}>
        <PeopleGrid board={everyStateBoard()} currentMonday={W47} />
      </AllocationEditingContext.Provider>,
    );
    expect(screen.queryByRole('button', { name: /^New allocation for/ })).toBeNull();
  });
});
