import { requirePermission, UnitOfWork } from '@arv/kernel';
import { Effect, Option } from 'effect';
import { EmailTaken } from '../../domain/errors';
import { makeCompanyEmail, type UserName } from '../../domain/user';
import { MANAGE_ACCESS } from '../../permissions';
import { type AccessRoleId, IdentityConfig, UserRepository } from '../ports';
import { describeUser, requireAccessRoles } from './user-access';

export interface AddUserInput {
  /** As typed by the admin; normalised (trimmed, lower-cased) here. */
  readonly email: string;
  readonly name: UserName;
  /** What the admin left ticked in the form (AC-04, AC-13); may be empty. */
  readonly accessRoleIds: ReadonlyArray<AccessRoleId>;
}

/**
 * Flow 4: puts a company-domain address on the access list with exactly the chosen roles
 * (AC-04). Invalid or foreign address → `NotCompanyAddress` (AC-05); an address already listed,
 * ignoring case → `EmailTaken` (AC-06); a ticked role deleted meanwhile → `AccessRoleNotFound`.
 */
export const addUser = (input: AddUserInput) =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_ACCESS);
    const { companyDomain } = yield* IdentityConfig;
    const email = yield* makeCompanyEmail(input.email, companyDomain);
    const users = yield* UserRepository;
    const unitOfWork = yield* UnitOfWork;

    // User and assignments are two statements in the real adapter: one transaction.
    return yield* unitOfWork.transactional(
      Effect.gen(function* () {
        if (Option.isSome(yield* users.findByEmail(email))) {
          return yield* new EmailTaken({ email });
        }
        const accessRoleIds = yield* requireAccessRoles(input.accessRoleIds);
        // A racing duplicate is refused by the repository as `EmailTaken` too.
        const user = yield* users.create({ email, name: input.name }, accessRoleIds);
        return yield* describeUser(user);
      }),
    );
  });
