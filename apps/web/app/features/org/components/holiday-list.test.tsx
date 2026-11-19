import { cleanup, render, screen, within } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { MissingPermissionNotice } from '~/features/identity/components/refusal-screens';
import { HolidayList } from './holiday-list';

afterEach(cleanup);

const holidays = [
  {
    id: '5e6f7081-9203-4a4b-8c5d-6e7f8091a200',
    holidayDate: '2026-01-01',
    name: 'New Year’s Day',
    createdAt: new Date('2025-11-01T10:00:00.000Z'),
  },
  {
    id: '5e6f7081-9203-4a4b-8c5d-6e7f8091a201',
    holidayDate: '2026-12-25',
    name: 'Christmas Day',
    createdAt: new Date('2026-11-01T10:00:00.000Z'),
  },
];

function renderList(canManage: boolean, list = holidays) {
  const Stub = createRoutesStub([
    {
      path: '/holidays',
      Component: () => (
        <HolidayList
          holidays={list}
          year={2026}
          years={[2025, 2026, 2027]}
          canManage={canManage}
          onAdd={() => {}}
        />
      ),
    },
  ]);
  render(<Stub initialEntries={['/holidays']} />);
}

describe('HolidayList', () => {
  it('lists the year with each date’s weekday and the year in the URL', async () => {
    renderList(true);
    const table = await screen.findByRole('table', { name: 'Holidays 2026' });
    expect(within(table).getByText('Fri 2026-12-25')).toBeTruthy();
    expect(within(table).getByText('Thu 2026-01-01')).toBeTruthy();
    const year = screen.getByRole('navigation', { name: 'Year' });
    expect(within(year).getByRole('link', { name: '2026' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(within(year).getByRole('link', { name: '2027' }).getAttribute('href')).toBe(
      '/holidays?year=2027',
    );
    expect(screen.getByRole('button', { name: 'Add holiday' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Christmas Day' })).toBeTruthy();
  });

  it('is read-only without manage-holiday-list (AC-28)', async () => {
    renderList(false);
    await screen.findByRole('table', { name: 'Holidays 2026' });
    expect(screen.queryByRole('button', { name: 'Add holiday' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
    expect(screen.getByText(/needs the manage holiday list permission/)).toBeTruthy();
  });

  it('says when the year has no holidays', async () => {
    renderList(true, []);
    expect(await screen.findByText('No holidays in 2026 yet.')).toBeTruthy();
  });
});

describe('forbidden state (AC-28)', () => {
  it('names the missing permission and shows nothing of the page', () => {
    const Stub = createRoutesStub([
      { path: '/', Component: () => <MissingPermissionNotice permission="manage holiday list" /> },
    ]);
    render(<Stub />);
    return screen
      .findByRole('heading', { name: 'You don’t have the “manage holiday list” permission.' })
      .then(() => {
        expect(screen.getByText('Ask an admin to grant it.')).toBeTruthy();
        expect(screen.queryByRole('table')).toBeNull();
      });
  });
});
