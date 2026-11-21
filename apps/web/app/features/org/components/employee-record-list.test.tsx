import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { kateryna, logins, olena } from '../test-data';
import { EmployeeRecordList } from './employee-record-list';

afterEach(cleanup);

const renderList = (props: Partial<Parameters<typeof EmployeeRecordList>[0]> = {}) =>
  render(
    <EmployeeRecordList
      records={[olena, kateryna]}
      logins={logins}
      action={null}
      onEdit={() => {}}
      {...props}
    />,
  );

const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;

describe('EmployeeRecordList', () => {
  it('shows each record with its terms, login and completeness (AC-06)', () => {
    renderList();
    const row = rowOf('Olena Kovalenko');
    expect(within(row).getByText('Platform')).toBeTruthy();
    expect(within(row).getByText('40h')).toBeTruthy();
    expect(within(row).getByRole('img', { name: 'Mon–Fri' })).toBeTruthy();
    expect(within(row).getByText('2023-02-01 – present')).toBeTruthy();
    expect(within(row).getByText('olena.kovalenko')).toBeTruthy();
    expect(within(row).getByText('Complete')).toBeTruthy();

    const incomplete = rowOf('Kateryna Shevchuk');
    expect(within(incomplete).getByText('No team')).toBeTruthy();
    expect(within(incomplete).getByText('—')).toBeTruthy();
    expect(within(incomplete).getByText('Not linked')).toBeTruthy();
    expect(within(incomplete).getByText('Incomplete')).toBeTruthy();
    expect(screen.getByText('2 of 2 records · 1 incomplete')).toBeTruthy();
  });

  it('says «Linked» when logins cannot be named', () => {
    renderList({ logins: null });
    expect(within(rowOf('Olena Kovalenko')).getByText('Linked')).toBeTruthy();
  });

  it('filters by team, incomplete and name', async () => {
    renderList();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Platform' }));
    expect(screen.queryByText('Kateryna Shevchuk')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'All' }));

    await user.click(screen.getByRole('checkbox', { name: 'Incomplete only' }));
    expect(screen.queryByText('Olena Kovalenko')).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: 'Incomplete only' }));

    await user.type(screen.getByRole('searchbox', { name: 'Search people' }), 'olena');
    expect(screen.queryByText('Kateryna Shevchuk')).toBeNull();
    expect(screen.getByText('1 of 2 records · 1 incomplete')).toBeTruthy();
  });

  it('opens a record for editing', async () => {
    const onEdit = vi.fn();
    renderList({ onEdit });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Edit Olena Kovalenko' }));
    expect(onEdit).toHaveBeenCalledWith(olena);
  });

  it('shows an empty state', () => {
    renderList({ records: [] });
    expect(screen.getByText('No employee records yet.')).toBeTruthy();
  });
});
