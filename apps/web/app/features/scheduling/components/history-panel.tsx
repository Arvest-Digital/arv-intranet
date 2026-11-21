import type { BoardAllocation } from '@arv/contracts/scheduling';
import { ArrowRightIcon, CircleAlertIcon, InfoIcon, XIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useFetcher } from 'react-router';
import { cn } from '~/shared/lib/utils';
import { PATHS } from '~/shared/paths';
import { Alert } from '~/shared/ui/alert';
import { Badge } from '~/shared/ui/badge';
import { Button } from '~/shared/ui/button';
import { Sheet, SheetClose, SheetContent, SheetTitle } from '~/shared/ui/sheet';
import { allocationName, dayMonth, TYPE_LABEL } from '../board';
import {
  type EntryView,
  entryView,
  HISTORY_MESSAGE,
  type HistoryResult,
  isRedacted,
  type SegmentView,
} from '../history';
import { ProjectSwatch } from './allocation-dialog';
import { TypeChip } from './board-cell';

/** The allocation whose history is open, with the person it belongs to. */
export type HistoryTarget = {
  readonly allocation: BoardAllocation;
  readonly employeeName: string;
};

/** Where the panel loads an allocation's history from (a resource route). */
export const historyHref = PATHS.allocationHistory;

/**
 * An allocation's change history in a side sheet (US-05, flow 7): each entry with who, when, from
 * which day and the values before → after, newest first, over the last 12 months (AC-16). Leave
 * the viewer may not see the type of reads «Away» throughout (AC-29). Its body mounts per
 * allocation, so reopening loads afresh.
 */
export function HistoryPanel({
  target,
  onOpenChange,
}: {
  target: HistoryTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={target !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[440px] max-sm:border-l-0"
      >
        {target ? <HistoryBody key={target.allocation.id} target={target} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function HistoryBody({ target }: { target: HistoryTarget }) {
  const fetcher = useFetcher<HistoryResult>();
  const { allocation, employeeName } = target;

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once per allocation
  useEffect(() => {
    fetcher.load(historyHref(allocation.id));
  }, [allocation.id]);

  const result = fetcher.data;
  const loading = result === undefined;
  const entries = result?.kind === 'list' ? result.entries : [];
  const redacted = (allocation.away && allocation.project === null) || entries.some(isRedacted);

  return (
    <>
      <div className="flex shrink-0 items-start gap-3 border-b border-border p-4">
        <div className="min-w-0 flex-1">
          <SheetTitle className="text-base font-semibold">History</SheetTitle>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] leading-5 text-muted-foreground">
            <ProjectSwatch projectId={allocation.away ? undefined : allocation.project?.id} />
            <span className="font-medium text-foreground">{allocationName(allocation)}</span>
            {allocation.project ? (
              <TypeChip leave={allocation.away}>{TYPE_LABEL[allocation.project.type]}</TypeChip>
            ) : null}
            <span aria-hidden="true">·</span>
            <span>{employeeName}</span>
          </div>
        </div>
        <SheetClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close history"
              className="max-sm:size-11"
            />
          }
        >
          <XIcon aria-hidden="true" />
        </SheetClose>
      </div>
      <div className="flex-1 overflow-auto p-4" aria-busy={loading}>
        {loading ? (
          <p className="text-[13px] text-muted-foreground">Loading history…</p>
        ) : result.kind === 'error' ? (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <p>{result.message}</p>
          </Alert>
        ) : (
          <>
            {redacted ? (
              <Alert role="note" className="mb-4 bg-muted/50">
                <InfoIcon aria-hidden="true" />
                <p>{HISTORY_MESSAGE.redacted}</p>
              </Alert>
            ) : null}
            {entries.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{HISTORY_MESSAGE.empty}</p>
            ) : (
              <ol aria-label="Changes, newest first" className="flex flex-col">
                {entries.map((entry) => (
                  <HistoryItem key={entry.id} entry={entryView(entry)} />
                ))}
              </ol>
            )}
          </>
        )}
      </div>
      <p className="shrink-0 border-t border-border px-4 py-3 text-xs text-muted-foreground">
        {HISTORY_MESSAGE.covers}
      </p>
    </>
  );
}

/** Each kind's badge: additions filled, changes outlined, trims dashed, removals in red. */
const BADGE_CLASS: Record<EntryView['kind'], string> = {
  created: 'border-border bg-secondary',
  imported: 'border-border bg-secondary',
  changed: 'border-foreground',
  trimmed: 'border-dashed border-foreground',
  removed: 'border-destructive/50 text-destructive',
};

const TONE_CLASS: Record<SegmentView['tone'], string> = {
  gone: 'text-muted-foreground line-through',
  same: 'text-muted-foreground',
  new: 'font-medium',
};

function HistoryItem({ entry }: { entry: EntryView }) {
  return (
    <li className="relative grid grid-cols-[16px_minmax(0,1fr)] gap-3 pb-5 last:pb-0 [&:not(:last-child)]:before:absolute [&:not(:last-child)]:before:top-[18px] [&:not(:last-child)]:before:bottom-0 [&:not(:last-child)]:before:left-[7px] [&:not(:last-child)]:before:w-px [&:not(:last-child)]:before:bg-border">
      <span
        aria-hidden="true"
        className="mt-[5px] ml-[3px] size-[9px] rounded-full border-[1.5px] border-ring bg-popover"
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn('px-1.5', BADGE_CLASS[entry.kind])}>
            {entry.label}
          </Badge>
          <span className="text-[13px] leading-5 font-medium">{entry.who}</span>
          <span className="num text-xs text-muted-foreground">{entry.when}</span>
        </div>
        {entry.note ? <p className="mt-1 text-[13px] leading-5">{entry.note}</p> : null}
        {entry.effectiveFrom ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Effective from <span className="num">{dayMonth(entry.effectiveFrom)}</span>
          </p>
        ) : null}
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)] items-start gap-2 rounded-md border border-border p-2 text-xs">
          <SegmentList heading="Before" segments={entry.before} />
          <ArrowRightIcon aria-hidden="true" className="mt-4 size-3.5 text-muted-foreground" />
          <SegmentList heading="After" segments={entry.after} />
        </div>
      </div>
    </li>
  );
}

function SegmentList({
  heading,
  segments,
}: {
  heading: string;
  segments: ReadonlyArray<SegmentView>;
}) {
  return (
    <div className="min-w-0">
      <span className="mb-0.5 block text-muted-foreground">{heading}</span>
      <ul aria-label={heading}>
        {segments.map((s) => (
          <li key={`${s.text}|${s.tone}`} className={cn('num py-0.5', TONE_CLASS[s.tone])}>
            {s.tone === 'gone' ? <span className="sr-only">Was </span> : null}
            {s.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
