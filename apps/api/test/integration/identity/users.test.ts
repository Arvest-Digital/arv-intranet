import { makeUser, seedUsers } from '@arv/db/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, postJson, resetDb, withDb } from '../../helpers';

beforeEach(resetDb);

describe('GET /users', () => {
  it('returns an empty list', async () => {
    const res = await api('/users');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns seeded users with ISO dates', async () => {
    await withDb((db) => seedUsers(db, [makeUser({ name: 'Ann' }), makeUser({ name: 'Bob' })]));

    const res = await api('/users');
    const body = (await res.json()) as Array<{ name: string; createdAt: string }>;
    expect(body.map((u) => u.name).sort()).toEqual(['Ann', 'Bob']);
    expect(new Date(body[0]!.createdAt).toISOString()).toBe(body[0]!.createdAt);
  });
});

describe('GET /users/:id', () => {
  it('returns the requested user among several', async () => {
    const seeded = await withDb((db) =>
      seedUsers(db, [makeUser({ name: 'Ann' }), makeUser({ name: 'Bob' })]),
    );
    const bob = seeded.find((u) => u.name === 'Bob')!;
    const res = await api(`/users/${bob.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: bob.id, name: 'Bob' });
  });

  it('returns 404 for an unknown id', async () => {
    await withDb((db) => seedUsers(db, [makeUser()]));
    const res = await api('/users/6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e91');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { _tag: 'NotFound' } });
  });

  it('returns 400 for a malformed id', async () => {
    const res = await api('/users/42');
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { _tag: 'ValidationError' } });
  });
});

describe('POST /users', () => {
  it('creates a user', async () => {
    await withDb((db) => seedUsers(db, [makeUser({ email: 'other@arvest.digital' })]));
    const res = await postJson('/users', { email: 'ann@arvest.digital', name: 'Ann' });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string };
    expect(created).toMatchObject({ email: 'ann@arvest.digital', name: 'Ann' });
    // Version nibble: the DB generates UUIDv7 ids.
    expect(created.id[14]).toBe('7');

    const list = (await (await api('/users')).json()) as unknown[];
    expect(list).toHaveLength(2);
  });

  it('returns 409 when the email is taken', async () => {
    await withDb((db) => seedUsers(db, [makeUser(), makeUser({ email: 'ann@arvest.digital' })]));
    const res = await postJson('/users', { email: 'ann@arvest.digital', name: 'Ann' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { _tag: 'Conflict' } });
  });

  it('returns 400 for invalid input', async () => {
    const res = await postJson('/users', { email: 'nope', name: '' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { _tag: 'ValidationError' } });
  });
});
