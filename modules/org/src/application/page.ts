/** Page size when the caller names none (openapi.yaml `Limit` default). */
export const DEFAULT_PAGE_LIMIT = 50;

/** A cursor page request: the page after or before an id seen, or the first page. */
export interface PageRequest {
  readonly after?: string;
  readonly before?: string;
  readonly limit?: number;
}

/** One page in id order, shaped like the contract's cursor pages (`EmployeeRecordPage`). */
export interface Page<A> {
  readonly items: ReadonlyArray<A>;
  readonly hasNext: boolean;
  readonly hasPrev: boolean;
  /** The last item's id when a next page exists. */
  readonly nextCursor: string | null;
}

/**
 * Cuts the page from `sorted`. `afterStart(cursor)` is where the page after `cursor` starts;
 * `beforeEnd(cursor)` is where the page before it ends. `after` wins when both are given; the
 * contract rejects that combination before it gets here.
 */
const cutPage = <A extends { readonly id: string }>(
  sorted: ReadonlyArray<A>,
  { after, before, limit = DEFAULT_PAGE_LIMIT }: PageRequest,
  afterStart: (cursor: string) => number,
  beforeEnd: (cursor: string) => number,
): Page<A> => {
  let start: number;
  let end: number;
  if (after === undefined && before !== undefined) {
    end = beforeEnd(before.toLowerCase());
    start = Math.max(0, end - limit);
  } else {
    start = after === undefined ? 0 : afterStart(after.toLowerCase());
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

/**
 * Cuts one page out of `items`, ordered by id (UUIDv7, so creation order). Cursors compare by
 * value, so a cursor whose item was deleted meanwhile still finds its place.
 */
export const pageById = <A extends { readonly id: string }>(
  items: ReadonlyArray<A>,
  page: PageRequest,
): Page<A> => {
  const sorted = [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const boundary = (test: (item: A) => boolean) => {
    const index = sorted.findIndex(test);
    return index === -1 ? sorted.length : index;
  };
  return cutPage(
    sorted,
    page,
    (cursor) => boundary((item) => item.id > cursor),
    (cursor) => boundary((item) => item.id >= cursor),
  );
};

/**
 * Cuts one page out of `ordered`, kept in the order given (e.g. holidays by date), with an
 * item's id as the cursor. A cursor that is no longer in the list has lost its place, so the
 * answer is the first page.
 */
export const pageInOrder = <A extends { readonly id: string }>(
  ordered: ReadonlyArray<A>,
  page: PageRequest,
): Page<A> => {
  const indexOf = (cursor: string) => ordered.findIndex((item) => item.id === cursor);
  return cutPage(
    ordered,
    page,
    (cursor) => {
      const index = indexOf(cursor);
      return index === -1 ? 0 : index + 1;
    },
    (cursor) => {
      const index = indexOf(cursor);
      return index === -1 ? Math.min(ordered.length, page.limit ?? DEFAULT_PAGE_LIMIT) : index;
    },
  );
};
