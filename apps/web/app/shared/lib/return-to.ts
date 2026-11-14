/** Where a sign-in ends when `returnTo` is missing or unsafe (AC-01). */
export const HOME_PATH = '/';

/** Browsers read `\` as `/` and drop tabs and newlines, so `/\evil` and `/\t/evil` leave the origin. */
const UNSAFE_CHARACTER = /[\\\p{Cc}]/u;

/**
 * The page to return to after sign-in, or home (sad §8 Open redirect, AC-01). Only a same-origin
 * path is accepted: it starts with `/`, not `//`, and holds no backslash or control character.
 */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string') return HOME_PATH;
  if (!value.startsWith('/') || value.startsWith('//')) return HOME_PATH;
  if (UNSAFE_CHARACTER.test(value)) return HOME_PATH;
  return value;
}
