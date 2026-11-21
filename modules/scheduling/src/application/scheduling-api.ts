import type { Today } from '@arv/kernel';
import { Context, Effect, Layer } from 'effect';
import type { AllocationHistoryRepository } from './ports';
import { type PurgeReport, purgeExpiredHistory } from './purge-history';

/** Facade for other modules and the host. Add a method only when one of them needs it. */
export class SchedulingApi extends Context.Tag('scheduling/SchedulingApi')<
  SchedulingApi,
  {
    /**
     * The monthly allocation-history purge, run by the host's Cron Trigger (sad §7, QS-5):
     * deletes the entries older than 12 months at run time and logs the retention report.
     * Idempotent; needs no actor.
     */
    readonly purgeExpiredHistory: () => Effect.Effect<PurgeReport>;
  }
>() {}

/** Captures the history repository and `Today` when built, so the facade's methods need nothing. */
export const SchedulingApiLive = Layer.effect(
  SchedulingApi,
  Effect.gen(function* () {
    const context = yield* Effect.context<AllocationHistoryRepository | Today>();
    return {
      purgeExpiredHistory: () => purgeExpiredHistory.pipe(Effect.provide(context)),
    };
  }),
);
