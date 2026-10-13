/**
 * `pnpm db:status`: compares migration files with what the database has applied
 * (like `php artisan migrate:status`). Exits 1 if anything needs attention.
 *
 * Mirrors drizzle's migrator: applied migrations live in `drizzle.__drizzle_migrations`
 * as (sha256 of the .sql file, journal `when`), and `migrate` only applies files newer
 * than the latest applied one.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

type JournalEntry = { tag: string; when: number };
// Drizzle stores the journal `when` (migration creation time) as created_at, not the apply time.
type Applied = { hash: string; created_at: string };
type Status = 'Ran' | 'Pending' | 'Skipped' | 'Changed' | 'Missing file';

const connectionString = process.env.DATABASE_URL ?? 'postgres://arv:arv@localhost:5432/arv';
const migrationsDir = new URL('../drizzle/', import.meta.url);

const journal: { entries: JournalEntry[] } = JSON.parse(
  readFileSync(new URL('meta/_journal.json', migrationsDir), 'utf8'),
);
const files = journal.entries.map((entry) => ({
  ...entry,
  hash: createHash('sha256')
    .update(readFileSync(new URL(`${entry.tag}.sql`, migrationsDir), 'utf8'))
    .digest('hex'),
}));

const client = new pg.Client({ connectionString });
try {
  await client.connect();
} catch (error) {
  console.error(`Cannot connect to ${redact(connectionString)}: ${(error as Error).message}`);
  process.exit(2);
}
let applied: Applied[] = [];
try {
  const { rows } = await client.query<{ exists: boolean }>(
    `select to_regclass('drizzle.__drizzle_migrations') is not null as exists`,
  );
  if (rows[0]?.exists) {
    applied = (
      await client.query<Applied>(
        'select hash, created_at from drizzle.__drizzle_migrations order by created_at',
      )
    ).rows;
  }
} finally {
  await client.end();
}

const appliedByWhen = new Map(applied.map((row) => [Number(row.created_at), row]));
const lastApplied = Math.max(0, ...appliedByWhen.keys());

const report: Array<{ name: string; status: Status; created: string }> = files.map((file) => {
  const row = appliedByWhen.get(file.when);
  const created = formatDate(file.when);
  if (!row) {
    // `migrate` would never run this one: it's older than the latest applied migration.
    return { name: file.tag, status: file.when < lastApplied ? 'Skipped' : 'Pending', created };
  }
  return { name: file.tag, status: row.hash === file.hash ? 'Ran' : 'Changed', created };
});

const knownWhens = new Set(files.map((file) => file.when));
for (const [when] of appliedByWhen) {
  if (!knownWhens.has(when)) {
    report.push({ name: '(no file)', status: 'Missing file', created: formatDate(when) });
  }
}

const notes: Record<Exclude<Status, 'Ran'>, string> = {
  Pending: 'not applied yet; run `pnpm db:migrate`',
  Skipped: 'older than the latest applied migration, so `migrate` will NOT apply it',
  Changed: 'file was edited after it was applied',
  'Missing file': 'applied in the database but not in drizzle/',
};

console.log(`Database: ${redact(connectionString)}\n`);
printTable(
  ['Migration', 'Status', 'Created'],
  report.map((r) => [r.name, r.status, r.created]),
);

const problems = report.filter((r) => r.status !== 'Ran');
if (problems.length > 0) {
  console.log('');
  for (const status of new Set(problems.map((p) => p.status))) {
    if (status !== 'Ran') console.log(`${status}: ${notes[status]}`);
  }
  process.exit(1);
}
console.log(`\nUp to date (${report.length} migration${report.length === 1 ? '' : 's'}).`);

function formatDate(ms: number) {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
}

function redact(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

function printTable(header: string[], rows: string[][]) {
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i]?.length ?? 0)),
  );
  const line = (cells: string[]) => cells.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join('  ');
  console.log(line(header));
  console.log(line(widths.map((w) => '-'.repeat(w))));
  for (const row of rows) console.log(line(row));
}
