import type { Schema } from 'effect';

/**
 * Reject keys the struct does not declare (OpenAPI `additionalProperties: false`). Used on request
 * bodies, e.g. so a rename carrying `email` fails validation instead of being silently dropped.
 */
export const strict = <S extends Schema.Schema.Any>(schema: S): S =>
  schema.annotations({ parseOptions: { onExcessProperty: 'error' } }) as S;
