import { Either } from 'effect';

/**
 * A small RFC 4180 reader for the planning spreadsheet saved as CSV (T34; the real format is still
 * open, PRD §8). No parser package: whether one may be added is an open Tech Lead decision (sad §11).
 *
 * - Every cell comes back as text, exactly as written: nothing is evaluated, so a formula-like cell
 *   (`=`, `+`, `-`, `@`) stays plain text (PRD §6.1).
 * - Quoted cells may hold the delimiter, line breaks and `""` for a quote.
 * - Line breaks may be `\r\n`, `\n` or `\r`; a leading byte-order mark is dropped.
 * - The delimiter is detected from the first line: `,`, `;` (spreadsheets in many locales) or tab,
 *   whichever occurs most outside quotes; `,` when none does.
 */

/** One record of the file: its 1-based row number as a spreadsheet shows it, and its cells. */
export interface CsvRecord {
  readonly row: number;
  readonly cells: ReadonlyArray<string>;
}

export type CsvDelimiter = ',' | ';' | '\t';

const DELIMITERS: ReadonlyArray<CsvDelimiter> = [',', ';', '\t'];

/** The delimiter used most outside quotes on the first line. */
export const detectDelimiter = (text: string): CsvDelimiter => {
  const counts = new Map<CsvDelimiter, number>(DELIMITERS.map((d) => [d, 0]));
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && counts.has(char as CsvDelimiter)) {
      counts.set(char as CsvDelimiter, (counts.get(char as CsvDelimiter) ?? 0) + 1);
    }
  }
  let best: CsvDelimiter = ',';
  for (const d of DELIMITERS) if ((counts.get(d) ?? 0) > (counts.get(best) ?? 0)) best = d;
  return best;
};

/** The file ends inside a quoted cell that started on `row`. */
export interface UnterminatedQuote {
  readonly row: number;
}

/**
 * Splits `text` into records. A record's row number counts the line breaks outside quotes, so a
 * quoted cell spanning lines still takes one spreadsheet row. A trailing line break adds no record.
 */
export const parseCsv = (
  input: string,
  delimiter: CsvDelimiter = detectDelimiter(input.replace(/^﻿/, '')),
): Either.Either<ReadonlyArray<CsvRecord>, UnterminatedQuote> => {
  const text = input.replace(/^﻿/, '');
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let row = 1;
  let i = 0;

  const endCell = () => {
    cells.push(cell);
    cell = '';
  };
  const endRecord = () => {
    endCell();
    records.push({ row, cells });
    cells = [];
    row += 1;
  };

  while (i < text.length) {
    const char = text[i] as string;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        cell += char;
      }
      i += 1;
      continue;
    }
    if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === delimiter) {
      endCell();
    } else if (char === '\r' || char === '\n') {
      endRecord();
      if (char === '\r' && text[i + 1] === '\n') i += 1;
    } else {
      cell += char;
    }
    i += 1;
  }

  if (quoted) return Either.left({ row });
  // Text after the last line break is one more record; a trailing break adds none.
  if (cell !== '' || cells.length > 0) endRecord();
  return Either.right(records);
};
