/** Page size when the caller names none (openapi.yaml `Limit` default). */
export const DEFAULT_PAGE_LIMIT = 50;

/** A cursor page request: the page after or before an id seen, or the first page. */
export interface PageRequest {
  readonly after?: string;
  readonly before?: string;
  readonly limit?: number;
}

/** One page, shaped like the contract's cursor pages (`ProjectPage`). */
export interface Page<A> {
  readonly items: ReadonlyArray<A>;
  readonly hasNext: boolean;
  readonly hasPrev: boolean;
  /** The last item's id when a next page exists. */
  readonly nextCursor: string | null;
}

/**
 * Cuts one page out of `ordered`, kept in the order given (projects by name), with an item's id
 * as the cursor. A cursor that is not in the list (e.g. a project the filter now leaves out) has
 * lost its place, so the answer is the first page. `after` wins when both are given; the contract
 * rejects that combination before it gets here.
 */
export const pageInOrder = <A extends { readonly id: string }>(
  ordered: ReadonlyArray<A>,
  { after, before, limit = DEFAULT_PAGE_LIMIT }: PageRequest,
): Page<A> => {
  const indexOf = (cursor: string) => ordered.findIndex((item) => item.id === cursor.toLowerCase());
  let start: number;
  let end: number;
  if (after === undefined && before !== undefined) {
    const index = indexOf(before);
    end = index === -1 ? Math.min(ordered.length, limit) : index;
    start = Math.max(0, end - limit);
  } else {
    const index = after === undefined ? -1 : indexOf(after);
    start = index + 1;
    end = Math.min(ordered.length, start + limit);
  }
  const items = ordered.slice(start, end);
  const hasNext = end < ordered.length;
  return {
    items,
    hasNext,
    hasPrev: start > 0,
    nextCursor: hasNext ? (items.at(-1)?.id ?? null) : null,
  };
};
