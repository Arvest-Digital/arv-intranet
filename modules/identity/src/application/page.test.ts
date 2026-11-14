import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_LIMIT, pageById } from './page';

const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;
/** Ids 1..n, deliberately out of order. */
const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: id(i + 1) })).sort(() => -1);
const ids = (page: { items: ReadonlyArray<{ id: string }> }) => page.items.map((item) => item.id);

describe('pageById', () => {
  it('returns the first page in id order, defaulting the limit to 50', () => {
    const page = pageById(items(60), {});
    expect(page.items).toHaveLength(DEFAULT_PAGE_LIMIT);
    expect(ids(page)[0]).toBe(id(1));
    expect(page).toMatchObject({ hasNext: true, hasPrev: false, nextCursor: id(50) });
  });

  it('returns everything on one page when it fits', () => {
    expect(pageById(items(3), { limit: 3 })).toEqual({
      items: [{ id: id(1) }, { id: id(2) }, { id: id(3) }],
      hasNext: false,
      hasPrev: false,
      nextCursor: null,
    });
  });

  it('starts after the cursor', () => {
    const page = pageById(items(5), { after: id(2), limit: 2 });
    expect(ids(page)).toEqual([id(3), id(4)]);
    expect(page).toMatchObject({ hasNext: true, hasPrev: true, nextCursor: id(4) });
  });

  it('ends before the cursor', () => {
    const page = pageById(items(5), { before: id(4), limit: 2 });
    expect(ids(page)).toEqual([id(2), id(3)]);
    expect(page).toMatchObject({ hasNext: true, hasPrev: true, nextCursor: id(3) });
  });

  it('keeps its place when the cursor item is gone, in any letter case', () => {
    const remaining = items(5).filter((item) => item.id !== id(3));
    expect(ids(pageById(remaining, { after: id(3).toUpperCase(), limit: 10 }))).toEqual([
      id(4),
      id(5),
    ]);
    expect(ids(pageById(remaining, { before: id(3), limit: 10 }))).toEqual([id(1), id(2)]);
  });

  it('gives an empty last page after the last id', () => {
    expect(pageById(items(2), { after: id(2) })).toEqual({
      items: [],
      hasNext: false,
      hasPrev: true,
      nextCursor: null,
    });
  });
});
