import { User as UserDto } from '@arv/contracts/identity';
import { Conflict, NotFound } from '@arv/contracts/shared';
import { Schema } from 'effect';
import type { EmailTaken, UserNotFound } from '../domain/errors';
import type { User } from '../domain/user';

const encodeUser = Schema.encodeSync(UserDto);

export const presentUser = (user: User) => encodeUser(user);

export const toContractError = (error: UserNotFound | EmailTaken) => {
  switch (error._tag) {
    case 'UserNotFound':
      return new NotFound({ resource: 'User', id: error.id });
    case 'EmailTaken':
      return new Conflict({ message: `User with email ${error.email} already exists` });
  }
};
