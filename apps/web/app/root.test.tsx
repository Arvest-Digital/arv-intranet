import { cleanup, render, screen } from '@testing-library/react';
import { createRoutesStub, data } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { AppNav } from './features/identity/components/app-nav';
import { ErrorBoundary } from './root';

afterEach(cleanup);

const me = (permissions: string[]) => ({
  id: '6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e91',
  email: 'ann@arvest.digital',
  name: 'Ann',
  permissions,
});

function renderNav(permissions: string[]) {
  const Stub = createRoutesStub([{ path: '/', Component: () => <AppNav me={me(permissions)} /> }]);
  render(<Stub initialEntries={['/']} />);
}

describe('navigation by permission (AC-08)', () => {
  it('hides «Access» from a user without manage access', async () => {
    renderNav(['scheduling:view-whole-board']);
    expect(await screen.findByRole('link', { name: 'Home' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Access' })).toBeNull();
  });

  it('shows «Access» to a user with manage access', async () => {
    renderNav(['identity:manage-access']);
    expect(await screen.findByRole('link', { name: 'Access' })).toBeTruthy();
  });

  it('puts the signed-in user and the sign-out menu in the nav', async () => {
    renderNav([]);
    expect(await screen.findByRole('button', { name: 'Ann' })).toBeTruthy();
  });
});

describe('root error boundary', () => {
  const renderThrown = (thrown: unknown) => {
    const Stub = createRoutesStub([
      {
        id: 'root',
        path: '/',
        Component: () => null,
        ErrorBoundary: ErrorBoundary as never,
        loader: () => {
          throw thrown;
        },
      },
    ]);
    render(<Stub initialEntries={['/']} />);
  };

  it('tells a removed user they no longer have access (AC-07)', async () => {
    renderThrown(data({ reason: 'access-removed' }, { status: 401 }));
    expect(await screen.findByRole('heading', { name: 'Access removed' })).toBeTruthy();
    expect(screen.getByText('You no longer have access to the intranet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeTruthy();
  });

  it('tells a user without the permission so, showing nothing else (AC-08)', async () => {
    renderThrown(data({ reason: 'missing-permission' }, { status: 403 }));
    expect(
      await screen.findByRole('heading', { name: "You don't have permission to manage access." }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to home' }).getAttribute('href')).toBe('/');
  });

  it('shows a bare error page with no data when the gate fails', async () => {
    renderThrown(data('Something went wrong', { status: 502 }));
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeTruthy();
  });
});
