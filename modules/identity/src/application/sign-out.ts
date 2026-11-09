import { Effect } from 'effect';
import { hashSessionToken } from '../domain/session';
import { SessionRepository } from './ports';

/**
 * Ends this one session (sad §6 Flow 11, AC-20); the user's other sessions are kept.
 * An unknown, expired or revoked token is treated as already signed out.
 */
export const signOut = (token: string): Effect.Effect<void, never, SessionRepository> =>
  Effect.gen(function* () {
    const sessions = yield* SessionRepository;
    yield* sessions.deleteByHash(yield* hashSessionToken(token));
  });
