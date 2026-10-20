import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { UserList } from './user-list';

afterEach(cleanup);

describe('UserList', () => {
  it('shows an empty state', () => {
    render(<UserList users={[]} />);
    expect(screen.getByText('No users yet.')).toBeTruthy();
  });

  it('renders one row per user', () => {
    render(
      <UserList
        users={[
          {
            id: '6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e91',
            email: 'ann@arvest.digital',
            name: 'Ann',
            createdAt: new Date('2026-10-13T10:00:00Z'),
          },
        ]}
      />,
    );
    expect(screen.getByText('Ann')).toBeTruthy();
    expect(screen.getByText('ann@arvest.digital')).toBeTruthy();
    expect(screen.getByText('2026-10-13')).toBeTruthy();
  });
});
