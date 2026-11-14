import { UserId } from '@arv/kernel';
import { type Brand, Either, Schema } from 'effect';
import { NotCompanyAddress } from './errors';

export const COMPANY_EMAIL_MAX_LENGTH = 254;
export const USER_NAME_MAX_LENGTH = 200;

/** A lower-cased, trimmed, valid address on the company domain (AC-05, AC-06). */
export type CompanyEmail = string & Brand.Brand<'CompanyEmail'>;

// Local part: dot-atom of RFC 5322 atext, no leading, trailing or doubled dots. Built from a
// string because the backtick and slash in atext break syntax highlighting inside a regex literal.
const ATEXT = "[a-z0-9!#$%&'*+/=?^_`{|}~-]+";
const LOCAL_PART = new RegExp(`^${ATEXT}(?:\\.${ATEXT})*$`);

/** `' Anna@Example.com '` → `'anna@example.com'`. The stored and compared form of an address. */
export const normaliseEmail = (raw: string): string => raw.trim().toLowerCase();

/**
 * Normalises `raw` and accepts it only if it is a valid address of at most 254 characters on
 * `companyDomain` (the configured domain, e.g. `arvest.digital`; a leading `@` is ignored).
 */
export const makeCompanyEmail = (
  raw: string,
  companyDomain: string,
): Either.Either<CompanyEmail, NotCompanyAddress> => {
  const email = normaliseEmail(raw);
  const domain = normaliseEmail(companyDomain).replace(/^@/, '');
  const at = email.lastIndexOf('@');
  const valid =
    domain.length > 0 &&
    email.length <= COMPANY_EMAIL_MAX_LENGTH &&
    at > 0 &&
    email.slice(at + 1) === domain &&
    LOCAL_PART.test(email.slice(0, at));
  return valid
    ? Either.right(email as CompanyEmail)
    : Either.left(new NotCompanyAddress({ email }));
};

/** A trimmed, non-empty name of at most 200 characters. Decoding trims the input. */
export const UserName = Schema.Trim.pipe(
  Schema.compose(
    Schema.String.pipe(
      Schema.nonEmptyString(),
      Schema.maxLength(USER_NAME_MAX_LENGTH),
      Schema.brand('UserName'),
    ),
  ),
);
export type UserName = typeof UserName.Type;

export class User extends Schema.Class<User>('User')({
  id: UserId,
  email: Schema.String,
  name: Schema.String,
  createdAt: Schema.DateFromSelf,
}) {}

/**
 * Corrects a user's name (AC-21). The email never changes after the user is created, so there
 * is deliberately no operation that replaces it.
 */
export const renameUser = (user: User, name: UserName): User => new User({ ...user, name });

/** What a new user is created from; the database assigns `id` and `createdAt`. */
export type NewUser = { readonly email: string; readonly name: string };
