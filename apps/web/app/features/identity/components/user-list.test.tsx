import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { anna, roles } from '../test-data';
import { UserList } from './user-list';

afterEach(cleanup);

describe('UserList', () => {
  it('shows an empty state', () => {
    render(<UserList users={[]} roles={roles} />);
    expect(screen.getByText('No users yet.')).toBeTruthy();
  });

  it('renders one row per user with their access roles', () => {
    render(<UserList users={[anna]} roles={roles} />);
    expect(screen.getByText('Anna Kovalenko')).toBeTruthy();
    expect(screen.getAllByText('anna@arvest.digital').length).toBeGreaterThan(0);
    expect(screen.getByText('Staff')).toBeTruthy();
    expect(screen.getByText('Planner')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Actions for Anna Kovalenko' })).toBeTruthy();
  });

  it('says when a user holds no access role', () => {
    render(<UserList users={[{ ...anna, accessRoles: [] }]} roles={roles} />);
    expect(screen.getByText('None')).toBeTruthy();
  });
});
