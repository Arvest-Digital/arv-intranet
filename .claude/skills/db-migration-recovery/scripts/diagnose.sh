#!/usr/bin/env bash
# Read-only triage for Drizzle migrations in @arv/migrations. Writes nothing.
# Usage: bash .claude/skills/db-migration-recovery/scripts/diagnose.sh
# Exits 1 if any check failed (db:status non-zero counts as failed).
set -u

root="$(git rev-parse --show-toplevel)"
cd "$root" || exit 2
drizzle_dir="packages/migrations/drizzle"
failed=0

section() { printf '\n== %s ==\n' "$1"; }

section "Target database"
url="${DATABASE_URL:-postgres://arv:arv@localhost:5432/arv}"
# Redact the password: scheme://user:***@host/db
echo "$url" | sed -E 's#(://[^:/@]+):[^@]*@#\1:***@#'
case "$url" in
  *hyperdrive*) echo "WARNING: looks like a Hyperdrive URL; drizzle-kit needs Neon's direct URL." ;;
esac

case "$url" in
  *localhost* | *127.0.0.1*)
    section "Local docker Postgres"
    docker compose ps postgres 2>&1 || echo "(docker compose unavailable)"
    ;;
esac

section "pnpm db:status"
pnpm --silent db:status
status=$?
if [ "$status" -ne 0 ]; then
  failed=1
  echo "(db:status exited $status: 1 = needs attention, 2 = cannot connect)"
fi

section "drizzle-kit check (snapshot consistency)"
if ! pnpm --silent --filter @arv/migrations exec drizzle-kit check; then failed=1; fi

section "Journal integrity"
if ! node -e '
const fs = require("node:fs");
const dir = process.argv[1];
const { entries } = JSON.parse(fs.readFileSync(`${dir}/meta/_journal.json`, "utf8"));
let ok = true;
const fail = (msg) => { console.log(`FAIL ${msg}`); ok = false; };
entries.forEach((e, i) => {
  if (e.idx !== i) fail(`${e.tag}: idx ${e.idx}, expected ${i}`);
  if (i > 0 && e.when <= entries[i - 1].when) fail(`${e.tag}: when ${e.when} is not after ${entries[i - 1].tag}`);
  if (!fs.existsSync(`${dir}/${e.tag}.sql`)) fail(`${e.tag}.sql missing`);
  const snap = `${dir}/meta/${e.tag.slice(0, 4)}_snapshot.json`;
  if (!fs.existsSync(snap)) fail(`${snap} missing`);
});
const tags = new Set(entries.map((e) => e.tag));
for (const f of fs.readdirSync(dir)) {
  if (f.endsWith(".sql") && !tags.has(f.slice(0, -4))) fail(`${f} not in journal`);
}
if (ok) console.log(`OK (${entries.length} entries)`);
process.exit(ok ? 0 : 1);
' "$drizzle_dir"; then failed=1; fi

section "git: uncommitted changes in $drizzle_dir"
git status --short -- "$drizzle_dir"

section "git: recent commits touching $drizzle_dir"
git log --oneline -n 5 -- "$drizzle_dir"

echo
if [ "$failed" -ne 0 ]; then
  echo "Result: problems found (see above)."
  exit 1
fi
echo "Result: all checks passed."
