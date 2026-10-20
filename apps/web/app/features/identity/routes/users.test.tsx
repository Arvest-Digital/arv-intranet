import { cleanup, render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeApi, json } from '../../../test/fake-api';
import Users, { action, loader } from './users';

afterEach(cleanup);

const ann = {
  id: '6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e91',
  email: 'ann@arvest.digital',
  name: 'Ann',
  createdAt: '2026-10-13T10:00:00.000Z',
};

// Loader/action args beyond context and request aren't used by these routes.
const args = (extra: { context: unknown; request: Request }) => ({ params: {}, ...extra }) as never;

describe('users loader', () => {
  it('fetches users through the API binding and decodes dates', async () => {
    const api = fakeApi(() => json([ann]));
    const result = await loader(
      args({ context: api.context, request: new Request('http://web/users') }),
    );

    expect(new URL(api.requests[0]!.url).pathname).toBe('/users');
    expect(result.users[0]!.createdAt).toBeInstanceOf(Date);
  });

  it('throws a 502 when the API fails', async () => {
    const api = fakeApi(() => json({ error: { _tag: 'InternalError', message: 'x' } }, 500));
    await expect(
      loader(args({ context: api.context, request: new Request('http://web/users') })),
    ).rejects.toMatchObject({ init: { status: 502 } });
  });
});

describe('users action', () => {
  const submit = (api: ReturnType<typeof fakeApi>, fields: Record<string, string>) =>
    action(
      args({
        context: api.context,
        request: new Request('http://web/users', {
          method: 'POST',
          body: new URLSearchParams(fields),
        }),
      }),
    );

  it('posts trimmed form values as JSON', async () => {
    const api = fakeApi(() => json(ann, 201));
    const result = await submit(api, { name: '  Ann ', email: 'ann@arvest.digital' });

    expect(result).toEqual({ error: null });
    expect(await api.requests[0]!.json()).toEqual({ name: 'Ann', email: 'ann@arvest.digital' });
  });

  it('returns the API error message', async () => {
    const api = fakeApi(() => json({ error: { _tag: 'Conflict', message: 'Email taken' } }, 409));
    const result = await submit(api, { name: 'Ann', email: 'ann@arvest.digital' });

    expect(result).toMatchObject({ data: { error: 'Email taken' }, init: { status: 409 } });
  });
});

describe('Users page', () => {
  it('renders users from the loader', async () => {
    const Stub = createRoutesStub([
      {
        path: '/users',
        Component: Users as never,
        loader: () => ({ users: [{ ...ann, createdAt: new Date(ann.createdAt) }] }),
      },
    ]);
    render(<Stub initialEntries={['/users']} />);

    expect(await screen.findByText('Ann')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add user' })).toBeTruthy();
  });
});
