import { type Brand, Schema } from 'effect';

/**
 * What team names are compared on: `lower(trim(name))`, the same rule as project names (AC-19d,
 * AC-24) and the `teams_name_key_unique` index. `'Platform'` and `'platform '` share `'platform'`.
 */
export type NameKey = string & Brand.Brand<'NameKey'>;

export const nameKey = (name: string): NameKey => name.trim().toLowerCase() as NameKey;

/** True when two names count as the same name (ignoring case and surrounding spaces). */
export const sameName = (a: string, b: string): boolean => nameKey(a) === nameKey(b);

/** A display name: trimmed, non-empty, at most `maxLength` characters. Decoding trims. */
export const trimmedName = <B extends string>(maxLength: number, brand: B) =>
  Schema.Trim.pipe(
    Schema.compose(
      Schema.String.pipe(Schema.nonEmptyString(), Schema.maxLength(maxLength), Schema.brand(brand)),
    ),
  );
