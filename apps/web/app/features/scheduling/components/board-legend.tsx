import { LockIcon, PlaneIcon } from 'lucide-react';
import type { CellKind } from '../board';
import { STATE_LABEL } from '../board';
import { StateIcon } from './board-cell';

const STATES: ReadonlyArray<readonly [CellKind, string]> = [
  ['free', '0/40'],
  ['partly-booked', '24/40'],
  ['fully-booked', '40/40'],
  ['overbooked', '48/40'],
  ['non-working', '—'],
  ['incomplete-record', '?'],
];

/**
 * What the icons mean. «Needs attention» is listed only for viewers who can see the mark (AC-22).
 */
export function BoardLegend({ showAttention }: { showAttention: boolean }) {
  const states: ReadonlyArray<readonly [CellKind, string]> = showAttention
    ? [...STATES, ['needs-attention', 'past end date']]
    : STATES;
  return (
    <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-4 py-2.5 text-xs">
      <span className="text-muted-foreground">Legend</span>
      {states.map(([kind, example]) => (
        <span key={kind} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <StateIcon kind={kind} />
          {STATE_LABEL[kind]}
          <span className="num text-muted-foreground">{example}</span>
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <PlaneIcon aria-hidden="true" className="size-3.5" />
        Away
        <span className="num text-muted-foreground">· 3d</span>
      </span>
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <LockIcon aria-hidden="true" className="size-3.5" />
        Past, view only
      </span>
    </footer>
  );
}
