import { UserId } from '@arv/kernel';
import { describe, expect, it } from 'vitest';
import { EmailTaken, UserNotFound } from '../domain/errors';
import { User } from '../domain/user';
import { presentUser, toContractError } from './presenter';

describe('presentUser', () => {
  it('encodes createdAt as an ISO string', () => {
    const user = new User({
      id: UserId.make('6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e91'),
      email: 'ann@arvest.digital',
      name: 'Ann',
      createdAt: new Date('2026-10-13T10:00:00Z'),
    });
    expect(presentUser(user)).toEqual({
      id: '6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e91',
      email: 'ann@arvest.digital',
      name: 'Ann',
      createdAt: '2026-10-13T10:00:00.000Z',
    });
  });
});

describe('toContractError', () => {
  it('maps UserNotFound to NotFound', () => {
    expect(toContractError(new UserNotFound({ id: 'x' }))._tag).toBe('NotFound');
  });

  it('maps EmailTaken to Conflict with a readable message', () => {
    const error = toContractError(new EmailTaken({ email: 'ann@arvest.digital' }));
    expect(error).toMatchObject({ _tag: 'Conflict', message: expect.stringContaining('exists') });
  });
});
