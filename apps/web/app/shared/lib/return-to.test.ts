import { describe, expect, it } from 'vitest';
import { HOME_PATH, safeReturnTo } from './return-to';

describe('safeReturnTo (AC-01)', () => {
  it.each(['/board', '/', '/access/users?cursor=abc#top', '/a//b'])('keeps the path %s', (path) => {
    expect(safeReturnTo(path)).toBe(path);
  });

  it.each([
    ['protocol-relative', '//evil.example'],
    ['absolute', 'https://evil.example/board'],
    ['javascript', 'javascript:alert(1)'],
    ['empty', ''],
    ['relative', 'board'],
    ['backslash', '/\\evil.example'],
    ['tab', '/\t/evil.example'],
    ['newline', '/\n/evil.example'],
  ])('sends a %s value home', (_, value) => {
    expect(safeReturnTo(value)).toBe(HOME_PATH);
  });

  it.each([null, undefined, 42, ['/board']])('sends a non-string home: %j', (value) => {
    expect(safeReturnTo(value)).toBe(HOME_PATH);
  });
});
