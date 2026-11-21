/**
 * AC-31: spreadsheet names that look like different spellings of one person or project — they
 * differ only in initials, letter case or spaces. Leading and trailing spaces never count (the same
 * rule as AC-24 / AC-19d), so `'Ada Lovelace '` *is* `'Ada Lovelace'`, not a different spelling.
 *
 * Two different spellings are similar when either:
 * - they are equal once case, spaces and dots are ignored (`'ada lovelace'`, `'AdaLovelace'`); or
 * - their words line up one to one, where a word matches itself or an initial matches a word
 *   starting with that letter, and initials missing on one side may be skipped (`'A. Lovelace'`,
 *   `'Ada K. Lovelace'` ~ `'Ada Lovelace'`). At least one full word must match, and initials may be
 *   skipped on one side only, so `'A. Lovelace'` and `'B. Lovelace'` stay two people.
 */

/** The spelling as compared: surrounding spaces dropped. */
export const spelling = (name: string): string => name.trim();

const words = (name: string): ReadonlyArray<string> =>
  name
    .toLowerCase()
    .split(/[\s.]+/)
    .filter((word) => word !== '');

const isInitial = (word: string): boolean => [...word].length === 1;

/** Words that line up one to one, initials allowed (see the module comment). */
const lineUp = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean => {
  // State: positions in a and b, whether an initial was skipped in a / in b, a full word matched.
  const seen = new Set<string>();
  const visit = (i: number, j: number, skipA: boolean, skipB: boolean, full: boolean): boolean => {
    if (skipA && skipB) return false;
    if (i === a.length && j === b.length) return full;
    const key = `${i}:${j}:${skipA}:${skipB}:${full}`;
    if (seen.has(key)) return false;
    seen.add(key);
    const x = a[i];
    const y = b[j];
    if (x !== undefined && y !== undefined) {
      if (x === y && visit(i + 1, j + 1, skipA, skipB, full || !isInitial(x))) return true;
      if (
        x !== y &&
        ((isInitial(x) && y.startsWith(x)) || (isInitial(y) && x.startsWith(y))) &&
        visit(i + 1, j + 1, skipA, skipB, full)
      )
        return true;
    }
    if (x !== undefined && isInitial(x) && visit(i + 1, j, true, skipB, full)) return true;
    if (y !== undefined && isInitial(y) && visit(i, j + 1, skipA, true, full)) return true;
    return false;
  };
  return visit(0, 0, false, false, false);
};

/** True when `a` and `b` are two different spellings of what looks like the same name. */
export const looksLikeSameName = (a: string, b: string): boolean => {
  const left = spelling(a);
  const right = spelling(b);
  if (left === right) return false;
  const wa = words(left);
  const wb = words(right);
  if (wa.join('') === wb.join('')) return true;
  return lineUp(wa, wb);
};
