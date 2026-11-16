import { IdentityApi } from '@arv/identity';
import type { UserId } from '@arv/kernel';
import { Effect, Option } from 'effect';
import { TeamNotFound, UserNotFound } from '../../domain/errors';
import type { TeamId } from '../../domain/team';
import { TeamRepository } from '../ports';

/** A record may name no team; a named one must exist (AC-19a). */
export const requireTeam = (teamId: TeamId | null) =>
  Effect.gen(function* () {
    if (teamId === null) return;
    const teams = yield* TeamRepository;
    if (Option.isNone(yield* teams.findById(teamId)))
      return yield* new TeamNotFound({ id: teamId });
  });

/** A record may link no login; a linked one must exist in identity (flow 9 precondition). */
export const requireLogin = (userId: UserId | null) =>
  Effect.gen(function* () {
    if (userId === null) return;
    const identity = yield* IdentityApi;
    if (!(yield* identity.userExists(userId))) return yield* new UserNotFound({ id: userId });
  });
