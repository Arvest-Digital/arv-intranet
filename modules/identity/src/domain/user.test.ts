import type { UserId } from '@arv/kernel';
import { describe, expect, it } from 'vitest';
import { User } from './user';

describe('User', () => {
  it('rejects an id that is not a UUID', () => {
    expect(
      () => new User({ id: 'x' as UserId, email: 'a@b.c', name: 'A', createdAt: new Date() }),
    ).toThrow();
  });
});
