import { Schema } from 'effect';

/** Page size bound of every cursor list (OpenAPI `Limit`; the server defaults to 50). */
export const PAGE_LIMIT_MAX = 100;

/**
 * The query of every cursor list (OpenAPI `After`, `Before`, `Limit`): the page after or before an id seen,
 * never both. `limit` arrives as a query string.
 */
export const PageQuery = Schema.Struct({
  after: Schema.optional(Schema.UUID),
  before: Schema.optional(Schema.UUID),
  limit: Schema.optional(
    Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, PAGE_LIMIT_MAX)),
  ),
}).pipe(
  Schema.filter((query) => query.after === undefined || query.before === undefined, {
    message: () => 'Use either after or before, not both',
  }),
);
export type PageQuery = typeof PageQuery.Type;
