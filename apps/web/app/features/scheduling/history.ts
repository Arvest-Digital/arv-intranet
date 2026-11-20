import type {
  AllocationHistoryEntry,
  AllocationSegment,
  ChangeKind,
} from '@arv/contracts/scheduling';
import { changedAtText, firstName } from './allocation';
import { dayMonth } from './board';

// The allocation history panel's model (T42, US-05, flow 7): what its loader answers and how each
// entry reads — who, when, effective from, and the segments before → after (AC-16), with leave the
// viewer may not see the type of as «Away» (AC-29).

/** An entry as the loader sends it: `createdAt` as an ISO string. */
export type HistoryEntry = Omit<AllocationHistoryEntry, 'createdAt'> & {
  readonly createdAt: string;
};

/** What the history loader answers the panel: the entries newest first, or why there are none. */
export type HistoryResult =
  | { readonly kind: 'list'; readonly entries: ReadonlyArray<HistoryEntry> }
  | { readonly kind: 'error'; readonly message: string };

export const HISTORY_MESSAGE = {
  forbidden: 'You lack the permission to see the allocation history.',
  gone: 'This allocation no longer exists.',
  failed: 'Could not load the history. Try again.',
  empty: 'No changes in the last 12 months.',
  redacted: 'Leave details are hidden for your role.',
  covers: 'History covers the last 12 months.',
} as const;

export const KIND_LABEL: Record<ChangeKind, string> = {
  created: 'Created',
  imported: 'Imported',
  changed: 'Changed',
  trimmed: 'Trimmed',
  removed: 'Removed',
};

/** How a segment reads in the diff: dropped, untouched, or what the change made. */
export type SegmentTone = 'gone' | 'same' | 'new';
export type SegmentView = { readonly text: string; readonly tone: SegmentTone };

export type EntryView = {
  readonly id: string;
  readonly kind: ChangeKind;
  readonly label: string;
  readonly who: string;
  readonly when: string;
  readonly note: string | null;
  readonly effectiveFrom: string | null;
  readonly before: ReadonlyArray<SegmentView>;
  readonly after: ReadonlyArray<SegmentView>;
};

/** Leave whose type the viewer may not see: no project, only «away» (AC-29). */
export const isRedacted = (entry: Pick<HistoryEntry, 'away' | 'project'>) =>
  entry.away && entry.project === null;

/** «20h/wk», «8h/day», «Full days» for visible leave, «Away» for hidden leave. */
function rateLabel(segment: AllocationSegment, redacted: boolean): string {
  if (segment.ratePeriod === 'full-day' || segment.rateMinutes === null) {
    return redacted ? 'Away' : 'Full days';
  }
  const h = segment.rateMinutes / 60;
  return `${Number.isInteger(h) ? h : Number(h.toFixed(2))}h/${segment.ratePeriod === 'week' ? 'wk' : 'day'}`;
}

/** «1 Oct–30 Nov · 20h/wk». */
export const segmentText = (segment: AllocationSegment, redacted: boolean) =>
  `${dayMonth(segment.startsOn)}–${dayMonth(segment.endsOn)} · ${rateLabel(segment, redacted)}`;

const sameSegment = (a: AllocationSegment, b: AllocationSegment) =>
  a.startsOn === b.startsOn &&
  a.endsOn === b.endsOn &&
  a.rateMinutes === b.rateMinutes &&
  a.ratePeriod === b.ratePeriod;

const NOTHING: ReadonlyArray<SegmentView> = [{ text: '—', tone: 'same' }];

/** Who a trim or an import names: the user who closed the project, or the importer. */
function noteFor(entry: HistoryEntry): string | null {
  const who = firstName(entry.changedBy.name);
  if (entry.changeKind === 'trimmed') {
    return entry.project
      ? `Trimmed when ${entry.project.name} was closed by ${who}`
      : `Trimmed when the project was closed by ${who}`;
  }
  if (entry.changeKind === 'imported') return `Imported by ${who} in the one-time import`;
  return null;
}

/** One entry as the panel shows it (AC-16). */
export function entryView(entry: HistoryEntry): EntryView {
  const redacted = isRedacted(entry);
  const before = entry.before ?? [];
  const after = entry.after ?? [];
  const effectiveFrom = entry.effectiveFrom ?? after[0]?.startsOn ?? null;
  return {
    id: entry.id,
    kind: entry.changeKind,
    label: KIND_LABEL[entry.changeKind],
    who: entry.changedBy.name,
    when: changedAtText(entry.createdAt),
    note: noteFor(entry),
    effectiveFrom,
    before:
      before.length === 0
        ? NOTHING
        : before.map((s) => ({
            text: segmentText(s, redacted),
            tone: after.some((a) => sameSegment(a, s)) ? 'same' : 'gone',
          })),
    after:
      after.length === 0
        ? NOTHING
        : after.map((s) => ({
            text: segmentText(s, redacted),
            // A change keeps the weeks before it: those read as untouched, not as new.
            tone:
              before.some((b) => sameSegment(b, s)) ||
              (entry.changeKind === 'changed' &&
                entry.effectiveFrom !== null &&
                s.endsOn < entry.effectiveFrom)
                ? 'same'
                : 'new',
          })),
  };
}
