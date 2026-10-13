import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { CreateUserInput, User } from './user';

describe('User', () => {
  const encoded = {
    id: '6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e91',
    email: 'ann@arvest.digital',
    name: 'Ann',
    createdAt: '2026-10-13T10:00:00.000Z',
  };

  it('decodes createdAt into a Date and encodes it back', () => {
    const user = Schema.decodeUnknownSync(User)(encoded);
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(Schema.encodeSync(User)(user)).toEqual(encoded);
  });

  it('accepts a UUIDv7 id (the DB default)', () => {
    const v7 = '01a135e4-c4d9-797e-ad76-ae23c85d58cd';
    expect(Schema.decodeUnknownSync(User)({ ...encoded, id: v7 }).id).toBe(v7);
  });

  it('rejects a non-UUID id', () => {
    const result = Schema.decodeUnknownEither(User)({ ...encoded, id: '42' });
    expect(Either.isLeft(result)).toBe(true);
  });
});

describe('CreateUserInput', () => {
  const decode = Schema.decodeUnknownEither(CreateUserInput);

  it('accepts a valid input', () => {
    expect(decode({ email: 'ann@arvest.digital', name: 'Ann' })).toEqual(
      Either.right({ email: 'ann@arvest.digital', name: 'Ann' }),
    );
  });

  it.each([
    ['invalid email', { email: 'not-an-email', name: 'Ann' }],
    ['empty name', { email: 'ann@arvest.digital', name: '' }],
    ['untrimmed name', { email: 'ann@arvest.digital', name: ' Ann ' }],
    ['too long name', { email: 'ann@arvest.digital', name: 'x'.repeat(101) }],
    ['missing field', { email: 'ann@arvest.digital' }],
  ])('rejects %s', (_, input) => {
    expect(Either.isLeft(decode(input))).toBe(true);
  });
});
