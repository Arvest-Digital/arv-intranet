import { Today } from '@arv/kernel';
import { Clock, Effect } from 'effect';
import type { IsoDate } from '../domain/allocation';
import { monthsBefore } from './board';
import { HISTORY_MONTHS } from './history';
import { AllocationHistoryRepository } from './ports';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The retention report of one purge run (PRD §6 «monthly retention job report», sad §7). */
export interface PurgeReport {
  /** Entries recorded before this instant were deleted. */
  readonly cutOff: Date;
  readonly entriesDeleted: number;
  /** Whole days since the oldest remaining entry was recorded; `null` when none remains. */
  readonly oldestRemainingAgeDays: number | null;
}

/**
 * The purge's cut-off for `today`: the start (UTC) of the same day 12 months earlier, the same
 * bound the history view reads from, so the purge deletes exactly what no viewer can see (AC-16).
 */
export const historyCutOff = (today: IsoDate): Date =>
  new Date(`${monthsBefore(today, HISTORY_MONTHS)}T00:00:00Z`);

/**
 * Deletes the allocation history entries recorded before `cutOff` and logs the retention report
 * line: entries deleted and the oldest remaining entry's age, no personal data (sad §7, QS-5).
 * Idempotent: a rerun for the same cut-off deletes nothing new.
 */
export const purgeHistory = (cutOff: Date) =>
  Effect.gen(function* () {
    const history = yield* AllocationHistoryRepository;
    const entriesDeleted = yield* history.deleteBefore(cutOff);
    const oldest = yield* history.oldestCreatedAt();
    const now = yield* Clock.currentTimeMillis;
    const report: PurgeReport = {
      cutOff,
      entriesDeleted,
      oldestRemainingAgeDays:
        oldest === null ? null : Math.max(0, Math.floor((now - oldest.getTime()) / DAY_MS)),
    };
    yield* Effect.logInfo('scheduling.history_purge').pipe(
      Effect.annotateLogs({
        cutOff: cutOff.toISOString(),
        entriesDeleted: report.entriesDeleted,
        oldestRemainingAgeDays: report.oldestRemainingAgeDays,
      }),
    );
    return report;
  });

/**
 * The monthly history purge (Cron Trigger `0 3 1 * *`): drops every entry older than 12 months
 * at run time. A failure is logged and re-raised, so the run is reported failed and alerts; the
 * next monthly run catches up (sad §6 Cross-cutting: Monthly history purge).
 */
export const purgeExpiredHistory = Effect.gen(function* () {
  const today = yield* (yield* Today).date;
  return yield* purgeHistory(historyCutOff(today));
}).pipe(Effect.tapErrorCause((cause) => Effect.logError('scheduling.history_purge_failed', cause)));
