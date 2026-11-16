import { describe, expect, it } from 'vitest';
import { pageById, pageInOrder } from './page';

// Ids out of list order, as with holidays added out of date order.
const items = ['c', 'a', 'd', 'b'].map((id) => ({ id }));
const ids = (page: { items: ReadonlyArray<{ id: string }> }) => page.items.map((i) => i.id);

describe('pageInOrder', () => {
  it('keeps the given order and continues after a cursor', () => {
    const first = pageInOrder(items, { limit: 2 });
    expect(first).toEqual({
      items: [{ id: 'c' }, { id: 'a' }],
      hasNext: true,
      hasPrev: false,
      nextCursor: 'a',
    });
    expect(ids(pageInOrder(items, { after: 'a', limit: 2 }))).toEqual(['d', 'b']);
  });

  it('goes back before a cursor', () => {
    const page = pageInOrder(items, { before: 'd', limit: 1 });
    expect(ids(page)).toEqual(['a']);
    expect(page).toMatchObject({ hasPrev: true, hasNext: true });
  });

  it('answers the first page for a cursor no longer in the list', () => {
    expect(ids(pageInOrder(items, { after: 'gone', limit: 2 }))).toEqual(['c', 'a']);
    expect(ids(pageInOrder(items, { before: 'gone', limit: 2 }))).toEqual(['c', 'a']);
  });
});

describe('pageById', () => {
  it('sorts by id and finds the place of a deleted cursor by value', () => {
    expect(ids(pageById(items, { limit: 2 }))).toEqual(['a', 'b']);
    expect(ids(pageById(items, { after: 'bb', limit: 2 }))).toEqual(['c', 'd']);
    expect(ids(pageById(items, { before: 'cc', limit: 2 }))).toEqual(['b', 'c']);
  });
});
