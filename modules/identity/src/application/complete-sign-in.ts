import { UnitOfWork, type UserId } from '@arv/kernel';
import { Clock, Effect, Option, Schema } from 'effect';
import { isFirstAdmin } from '../domain/last-admin';
import {
  generateSessionToken,
  hashSessionToken,
  type SessionToken,
  sessionExpiresAt,
} from '../domain/session';
import {
  requiresHostedDomain,
  SignInEligibility,
  signInEligibility,
} from '../domain/sign-in-eligibility';
import { USER_NAME_MAX_LENGTH, type User, UserName } from '../domain/user';
import {
  AccessRoleRepository,
  GoogleSignIn,
  IdentityConfig,
  SessionRepository,
  SignInRefused,
  UserRepository,
} from './ports';

/**
 * A verified company-domain person who is not on the access list (AC-03). `admins` are the
 * users holding manage access, name and email only; empty means «ask your manager».
 */
export class NotSetUp extends Schema.TaggedError<NotSetUp>()('NotSetUp', {
  admins: Schema.Array(Schema.Struct({ name: Schema.String, email: Schema.String })),
}) {}

/** A new session. The raw token is returned once and never stored (only its hash is). */
export interface SignedIn {
  readonly sessionToken: SessionToken;
  readonly userId: UserId;
  readonly expiresAt: Date;
}

export const SIGN_IN_SUCCEEDED_EVENT = 'identity.sign_in.succeeded';

/** The only sign-in log line: `userId`, nothing about the person or the claims (sad §8 Logging). */
const logSignedIn = (userId: UserId) =>
  Effect.sync(() => {
    console.info(JSON.stringify({ event: SIGN_IN_SUCCEEDED_EVENT, userId }));
  });

/** Google's name as a valid `UserName`: trimmed and cut to the column's 200 characters. */
const googleName = (name: string): UserName =>
  Schema.decodeSync(UserName)(name.trim().slice(0, USER_NAME_MAX_LENGTH));

/**
 * AC-15: the configured first admin, while nobody holds manage access, is put on the list under
 * Google's name (kept roles and all) and given «Admin». Returns `None` when the rule does not apply.
 */
const bootstrapFirstAdmin = (email: string, name: string) =>
  Effect.gen(function* () {
    const config = yield* IdentityConfig;
    const users = yield* UserRepository;
    const accessRoles = yield* AccessRoleRepository;

    // Count admins only for the configured address: an ordinary sign-in costs no extra query.
    if (!isFirstAdmin(email, config.firstAdminEmail, false)) return Option.none<User>();
    const adminExists = (yield* accessRoles.countManageAccessHolders()) > 0;
    if (!isFirstAdmin(email, config.firstAdminEmail, adminExists)) return Option.none<User>();

    const userName = googleName(name);
    const existing = yield* users.findByEmail(email);
    let user: User;
    if (Option.isNone(existing)) {
      // A concurrent sign-in of the same address that wins the insert aborts this transaction.
      user = yield* users
        .create({ email, name: userName })
        .pipe(Effect.catchTag('EmailTaken', () => Effect.dieMessage('identity.first_admin.race')));
    } else if (existing.value.name !== userName) {
      user = Option.getOrElse(
        yield* users.rename(existing.value.id, userName),
        () => existing.value,
      );
    } else {
      user = existing.value;
    }

    const admin = yield* accessRoles.ensureAdminRole();
    const held = yield* users.accessRoleIds(user.id);
    if (!held.includes(admin.id)) yield* users.setAccessRoles(user.id, [...held, admin.id]);
    return Option.some(user);
  });

/**
 * Critical flow 1, server leg (ADR-0007). Google is called before, never inside, the transaction
 * (sad §8 Transactions). Fails `SignInRefused` for any refused claim — nothing stored or logged
 * (AC-02) — and `NotSetUp` for a person not on the list (AC-03). On success the user holds a new
 * session expiring 7 days from now (AC-01).
 */
export const completeSignIn = (code: string, codeVerifier: string) =>
  Effect.gen(function* () {
    const google = yield* GoogleSignIn;
    const config = yield* IdentityConfig;
    const users = yield* UserRepository;
    const sessions = yield* SessionRepository;
    const accessRoles = yield* AccessRoleRepository;
    const unitOfWork = yield* UnitOfWork;

    const claims = yield* google.exchangeCode(code, codeVerifier);
    const eligibility = signInEligibility(claims, config.companyDomain, {
      requireHostedDomain: requiresHostedDomain(config),
    });
    if (!SignInEligibility.$is('Eligible')(eligibility)) return yield* new SignInRefused();
    const { email, name } = eligibility;

    const signedIn = yield* unitOfWork.transactional(
      Effect.gen(function* () {
        const firstAdmin = yield* bootstrapFirstAdmin(email, name);
        const listed = Option.isSome(firstAdmin) ? firstAdmin : yield* users.findByEmail(email);
        if (Option.isNone(listed)) {
          return yield* new NotSetUp({ admins: yield* accessRoles.listAdmins() });
        }

        yield* sessions.purgeExpired();
        const sessionToken = yield* generateSessionToken;
        const expiresAt = sessionExpiresAt(new Date(yield* Clock.currentTimeMillis));
        yield* sessions.create({
          tokenHash: yield* hashSessionToken(sessionToken),
          userId: listed.value.id,
          expiresAt,
        });
        return { sessionToken, userId: listed.value.id, expiresAt } satisfies SignedIn;
      }),
    );

    yield* logSignedIn(signedIn.userId);
    return signedIn;
  });
