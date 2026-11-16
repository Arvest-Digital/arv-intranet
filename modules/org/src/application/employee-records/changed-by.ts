import { Actor, CurrentActor, Unauthenticated } from '@arv/kernel';
import { Effect } from 'effect';

/** The signed-in user a write is stamped with («last changed by», sad §8). */
export const changedBy = Effect.flatMap(
  CurrentActor,
  Actor.$match({
    Anonymous: () => Effect.fail(new Unauthenticated({})),
    User: ({ id }) => Effect.succeed(id),
  }),
);
