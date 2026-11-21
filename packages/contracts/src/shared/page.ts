import { Schema } from 'effect';

/** Page size bound of every cursor list (OpenAPI `Limit`; the server defaults to 50). */
export const PAGE_LIMIT_MAX = 100;

const pageFields = {
  after: Schema.optional(Schema.UUID),
  before: Schema.optional(Schema.UUID),
  limit: Schema.optional(
    Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, PAGE_LIMIT_MAX)),
  ),
};

/**
 * The query of a cursor list with its own filters (`fields`) beside the page (OpenAPI `After`,
 * `Before`, `Limit`): the page after or before an id seen, never both. `limit` arrives as a
 * query string.
 */
export const pageQueryWith = <F extends Schema.Struct.Fields>(fields: F) =>
  Schema.Struct({ ...pageFields, ...fields }).pipe(
    Schema.filter(
      (query: { readonly after?: string; readonly before?: string }) =>
        query.after === undefined || query.before === undefined,
      { message: () => 'Use either after or before, not both' },
    ),
  );

/** The query of every cursor list with no filters of its own. */
export const PageQuery = pageQueryWith({});
export type PageQuery = typeof PageQuery.Type;
