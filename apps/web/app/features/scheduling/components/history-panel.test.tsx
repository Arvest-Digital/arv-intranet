import { cleanup, render, screen, within } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { HISTORY_MESSAGE, type HistoryResult } from '../history';
import {
  ATLAS,
  allocation,
  atlasHistory,
  LEAVE_ALLOCATION,
  redactedLeaveHistory,
  W47,
} from '../test-data';
import { HistoryPanel, type HistoryTarget } from './history-panel';

afterEach(cleanup);

/** Renders the open panel on /schedule, its loader answering `answer`. */
function renderPanel(target: HistoryTarget, answer: HistoryResult) {
  const loaded: string[] = [];
  const Stub = createRoutesStub([
    {
      path: '/schedule',
      Component: () => <HistoryPanel target={target} onOpenChange={() => {}} />,
    },
    {
      path: '/schedule/allocations/:allocationId/history',
      loader: ({ params }) => {
        loaded.push(params.allocationId ?? '');
        return answer;
      },
    },
  ]);
  render(<Stub initialEntries={['/schedule']} />);
  return { loaded };
}

const atlas = (): HistoryTarget => ({
  allocation: allocation(ATLAS, [[W47, 20]]),
  employeeName: 'Olena Kovalenko',
});

describe('HistoryPanel', () => {
  it('lists changes newest first with who, when, and before → after (AC-16)', async () => {
    const target = atlas();
    const { loaded } = renderPanel(target, {
      kind: 'list',
      entries: [...atlasHistory].reverse(),
    });
    const panel = await screen.findByRole('dialog', { name: 'History' });
    expect(within(panel).getByText('Atlas CRM')).toBeTruthy();
    expect(within(panel).getByText('Olena Kovalenko')).toBeTruthy();

    const list = await within(panel).findByRole('list', { name: 'Changes, newest first' });
    const items = within(list)
      .getAllByRole('listitem')
      .filter((li) => li.parentElement === list);
    expect(items.map((li) => li.querySelector('[data-slot="badge"]')?.textContent)).toEqual([
      'Changed',
      'Trimmed',
      'Imported',
    ]);
    expect(loaded).toEqual([target.allocation.id]);

    // The trim names the project and who closed it; the import who imported it.
    const [changedItem, trimmedItem, importedItem] = items;
    expect(
      within(trimmedItem!).getByText('Trimmed when Atlas CRM was closed by Andrii'),
    ).toBeTruthy();
    expect(within(trimmedItem!).getByText('2 Nov 2026, 10:15')).toBeTruthy();
    expect(
      within(within(trimmedItem!).getByRole('list', { name: 'After' })).getByText(
        '1 Oct–30 Nov · 20h/wk',
      ),
    ).toBeTruthy();
    expect(
      within(importedItem!).getByText('Imported by Andrii in the one-time import'),
    ).toBeTruthy();
    expect(within(importedItem!).getByText('Andrii Melnyk')).toBeTruthy();
    expect(within(changedItem!).getByText('Marko Ivanov')).toBeTruthy();
    expect(within(changedItem!).getByText('18 Nov–30 Nov · 10h/wk')).toBeTruthy();

    expect(within(panel).getByText(HISTORY_MESSAGE.covers)).toBeTruthy();
    expect(within(panel).queryByText(HISTORY_MESSAGE.redacted)).toBeNull();
  });

  it('shows hidden leave as «away» only (AC-29)', async () => {
    renderPanel(
      {
        allocation: { ...allocation(null, [[W47, 8]], true), id: LEAVE_ALLOCATION },
        employeeName: 'Sofia Lys',
      },
      { kind: 'list', entries: [...redactedLeaveHistory].reverse() },
    );
    const panel = await screen.findByRole('dialog', { name: 'History' });
    expect(await within(panel).findByText(HISTORY_MESSAGE.redacted)).toBeTruthy();
    expect(within(panel).getByText('Away')).toBeTruthy();
    expect(within(panel).getByText('12 Nov–13 Nov · Away')).toBeTruthy();
    expect(within(panel).queryByText(/Sick leave|Leave$/)).toBeNull();
  });

  it('says so when there is nothing to show, or it could not load', async () => {
    renderPanel(atlas(), { kind: 'list', entries: [] });
    expect(await screen.findByText(HISTORY_MESSAGE.empty)).toBeTruthy();
    cleanup();
    renderPanel(atlas(), { kind: 'error', message: HISTORY_MESSAGE.forbidden });
    expect(await screen.findByText(HISTORY_MESSAGE.forbidden)).toBeTruthy();
  });
});
