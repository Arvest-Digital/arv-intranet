import { Either } from 'effect';
import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv } from './csv';

const records = (text: string) => {
  const result = parseCsv(text);
  if (Either.isLeft(result)) throw new Error(`unterminated quote on row ${result.left.row}`);
  return result.right;
};

describe('parseCsv', () => {
  it('splits rows and cells, numbering rows from 1', () => {
    expect(records('a,b\n1,2\n')).toEqual([
      { row: 1, cells: ['a', 'b'] },
      { row: 2, cells: ['1', '2'] },
    ]);
  });

  it('accepts CRLF, CR and a last line without a break, and drops a byte-order mark', () => {
    expect(records('﻿a,b\r\n1,2\r3,4').map((r) => r.cells)).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('keeps delimiters, line breaks and doubled quotes inside quoted cells, as one row', () => {
    const parsed = records('name,note\n"Lovelace, Ada","said ""hi""\nthen left"\nnext,x');
    expect(parsed[1]).toEqual({ row: 2, cells: ['Lovelace, Ada', 'said "hi"\nthen left'] });
    expect(parsed[2]?.row).toBe(3);
  });

  it('keeps formula-like cells as plain text (PRD §6.1)', () => {
    expect(records('=SUM(A1:A2),+1,-2,@cmd\n')[0]?.cells).toEqual([
      '=SUM(A1:A2)',
      '+1',
      '-2',
      '@cmd',
    ]);
  });

  it('keeps empty cells', () => {
    expect(records('a,,c\n')[0]?.cells).toEqual(['a', '', 'c']);
  });

  it('reports a quote left open with the row it started on', () => {
    expect(parseCsv('a\n"open\nstill')).toEqual(Either.left({ row: 2 }));
  });

  it('reads semicolon- and tab-separated files', () => {
    expect(records('a;b\n1;2')[1]?.cells).toEqual(['1', '2']);
    expect(records('a\tb\n1\t2')[1]?.cells).toEqual(['1', '2']);
  });
});

describe('detectDelimiter', () => {
  it('picks the delimiter used most on the first line, outside quotes', () => {
    expect(detectDelimiter('a;b;c\n1,2,3,4,5')).toBe(';');
    expect(detectDelimiter('"a;b;c",d\n')).toBe(',');
    expect(detectDelimiter('single\n')).toBe(',');
  });
});
