import { UserId } from '@arv/kernel';
import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { NotCompanyAddress } from './errors';
import { makeCompanyEmail, renameUser, User, UserName } from './user';

const DOMAIN = 'arvest.digital';

const refused = (raw: string) => {
  const result = makeCompanyEmail(raw, DOMAIN);
  return Either.isLeft(result) && result.left instanceof NotCompanyAddress;
};

describe('User', () => {
  it('rejects an id that is not a UUID', () => {
    expect(
      () => new User({ id: 'x' as UserId, email: 'a@b.c', name: 'A', createdAt: new Date() }),
    ).toThrow();
  });
});

describe('makeCompanyEmail', () => {
  it('normalises case and surrounding spaces to the same address (AC-06)', () => {
    const a = makeCompanyEmail('Anna@arvest.digital', DOMAIN);
    const b = makeCompanyEmail(' anna@ARVEST.digital ', DOMAIN);
    expect(a).toEqual(Either.right('anna@arvest.digital'));
    expect(b).toEqual(a);
  });

  it('accepts the domain configured with a leading @ or in another case', () => {
    expect(makeCompanyEmail('anna@arvest.digital', ' @Arvest.Digital ')).toEqual(
      Either.right('anna@arvest.digital'),
    );
  });

  it('refuses an address on another domain as NotCompanyAddress (AC-05)', () => {
    expect(refused('anna@gmail.com')).toBe(true);
    expect(refused('anna@sub.arvest.digital')).toBe(true);
    expect(refused('anna@arvest.digital.evil.com')).toBe(true);
  });

  it.each([
    '',
    '   ',
    'anna',
    '@arvest.digital',
    'anna@',
    'an na@arvest.digital',
    'anna@@arvest.digital',
    'an@na@arvest.digital',
    '.anna@arvest.digital',
    'anna.@arvest.digital',
    'an..na@arvest.digital',
  ])('refuses the invalid address %j as NotCompanyAddress (AC-05)', (raw) => {
    expect(refused(raw)).toBe(true);
  });

  it('refuses an address longer than 254 characters', () => {
    const suffix = `@${DOMAIN}`;
    const fits = `${'a'.repeat(254 - suffix.length)}${suffix}`;
    expect(Either.isRight(makeCompanyEmail(fits, DOMAIN))).toBe(true);
    expect(refused(`a${fits}`)).toBe(true);
  });

  it('refuses everything when no domain is configured', () => {
    expect(Either.isLeft(makeCompanyEmail('anna@arvest.digital', ''))).toBe(true);
  });
});

describe('UserName', () => {
  const decode = Schema.decodeUnknownEither(UserName);

  it('trims the name', () => {
    expect(decode('  Anna Smith ')).toEqual(Either.right('Anna Smith'));
  });

  it('refuses an empty or blank name', () => {
    expect(Either.isLeft(decode(''))).toBe(true);
    expect(Either.isLeft(decode('   '))).toBe(true);
  });

  it('allows 200 characters and refuses 201', () => {
    expect(Either.isRight(decode('a'.repeat(200)))).toBe(true);
    expect(Either.isLeft(decode('a'.repeat(201)))).toBe(true);
  });
});

describe('renameUser', () => {
  it('changes the name and keeps the email (AC-21)', () => {
    const user = new User({
      id: UserId.make('6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e91'),
      email: 'anna@arvest.digital',
      name: 'Ana',
      createdAt: new Date('2026-10-13T10:00:00Z'),
    });
    const renamed = renameUser(user, Schema.decodeSync(UserName)('Anna'));
    expect(renamed).toMatchObject({ id: user.id, email: user.email, name: 'Anna' });
    expect(renamed.createdAt).toEqual(user.createdAt);
  });
});
