import { describe, expect, it } from 'vitest';
import { looksLikeSameName } from './similar-name';

describe('looksLikeSameName (AC-31)', () => {
  it.each([
    ['Ada Lovelace', 'ada lovelace', 'letter case'],
    ['Ada Lovelace', 'Ada  Lovelace', 'inner spaces'],
    ['Ada Lovelace', 'AdaLovelace', 'a missing space'],
    ['Ada Lovelace', 'A. Lovelace', 'an initial for a first name'],
    ['Ada Lovelace', 'A Lovelace', 'an initial without a dot'],
    ['Ada King Lovelace', 'Ada K. Lovelace', 'an initial for a middle name'],
    ['Ada Lovelace', 'Ada K. Lovelace', 'an extra middle initial'],
    ['Test User 1', 'T. User 1', 'the contract example'],
    ['Atlas Web', 'atlas web', 'a project name in another case'],
  ])('flags «%s» and «%s» (%s)', (a, b) => {
    expect(looksLikeSameName(a, b)).toBe(true);
    expect(looksLikeSameName(b, a)).toBe(true);
  });

  it.each([
    ['Ada Lovelace', 'Ada Lovelace', 'the same spelling'],
    ['Ada Lovelace', '  Ada Lovelace ', 'only surrounding spaces (AC-24 counts them the same)'],
    ['A. Lovelace', 'B. Lovelace', 'different initials'],
    ['Ada Lovelace', 'Ada Byron', 'different surnames'],
    ['Ada Lovelace', 'Anna Lovelace', 'different first names'],
    ['J. S.', 'John Smith', 'initials only, no full word to anchor them'],
    ['Atlas', 'Atlas Mobile', 'an extra full word'],
  ])('does not flag «%s» and «%s» (%s)', (a, b) => {
    expect(looksLikeSameName(a, b)).toBe(false);
  });
});
