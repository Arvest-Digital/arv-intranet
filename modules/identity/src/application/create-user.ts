import { Effect, Option } from 'effect';
import { EmailTaken } from '../domain/errors';
import type { NewUser } from '../domain/user';
import { UserRepository } from './ports';

/** Emails are unique. A concurrent insert that slips past the check hits the DB constraint (500). */
export const createUser = (input: NewUser) =>
  Effect.gen(function* () {
    const repo = yield* UserRepository;
    const existing = yield* repo.findByEmail(input.email);
    if (Option.isSome(existing)) {
      return yield* new EmailTaken({ email: input.email });
    }
    return yield* repo.create(input);
  });
