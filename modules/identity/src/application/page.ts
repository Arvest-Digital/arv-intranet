/** Page size when the caller names none (openapi.yaml `Limit` default). */
export const DEFAULT_PAGE_LIMIT = 50;

/** A cursor page request: the page after or before an id seen, or the first page. */
export interface PageRequest {
  readonly after?: string;
  readonly before?: string;
  readonly limit?: number;
}

/** One page in id order, shaped like the contract's cursor pages (`UserPage`, `AccessRolePage`). */
export interface Page<A> {
  readonly items: ReadonlyArray<A>;
  readonly hasNext: boolean;
  readonly hasPrev: boolean;
  /** The last item's id when a next page exists. */
  readonly nextCursor: string | null;
}

/**
 * Cuts one page out of `items`, ordered by id (UUIDv7, so creation order). Cursors compare by
 * value, so a cursor whose item was deleted meanwhile still finds its place. `after` wins when
 * both are given; the contract rejects that combination before it gets here.
 */
export const pageById = <A extends { readonly id: string }>(
  items: ReadonlyArray<A>,
  { after, before, limit = DEFAULT_PAGE_LIMIT }: PageRequest,
): Page<A> => {
  const sorted = [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const boundary = (test: (item: A) => boolean) => {
    const index = sorted.findIndex(test);
    return index === -1 ? sorted.length : index;
  };

  let start: number;
  let end: number;
  if (after === undefined && before !== undefined) {
    const cursor = before.toLowerCase();
    end = boundary((item) => item.id >= cursor);
    start = Math.max(0, end - limit);
  } else {
    const cursor = after?.toLowerCase();
    start = cursor === undefined ? 0 : boundary((item) => item.id > cursor);
    end = Math.min(sorted.length, start + limit);
  }

  const page = sorted.slice(start, end);
  const hasNext = end < sorted.length;
  return {
    items: page,
    hasNext,
    hasPrev: start > 0,
    nextCursor: hasNext ? (page.at(-1)?.id ?? null) : null,
  };
};
