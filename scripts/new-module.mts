/**
 * `pnpm new:module <name>`: copies modules/_template to modules/<name>, renaming the
 * `skeleton` placeholders. Prints the remaining manual steps.
 */
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const name = process.argv[2] ?? '';
if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
  console.error('Usage: pnpm new:module <name>   (kebab-case, e.g. `org` or `time-off`)');
  process.exit(1);
}

const root = new URL('..', import.meta.url).pathname;
const target = join(root, 'modules', name);
if (existsSync(target)) {
  console.error(`modules/${name} already exists`);
  process.exit(1);
}

const pascal = name.replace(/(^|-)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase());
const camel = pascal[0]?.toLowerCase() + pascal.slice(1);
const snake = name.replaceAll('-', '_');

const rename = (text: string) =>
  text
    .replaceAll('@arv/skeleton', `@arv/${name}`)
    .replaceAll("'skeleton/", `'${name}/`)
    .replaceAll('/skeleton-', `/${name}-`)
    .replaceAll('integration/skeleton', `integration/${name}`)
    .replaceAll("pgSchema('skeleton')", `pgSchema('${snake}')`)
    .replaceAll('`/skeleton`', `\`/${name}\``)
    .replaceAll('Skeleton', pascal)
    .replaceAll('skeleton', camel);

cpSync(join(root, 'modules', '_template'), target, { recursive: true });

const walk = (dir: string) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    let path = join(dir, entry.name);
    if (entry.name.includes('skeleton')) {
      const renamed = join(dir, entry.name.replaceAll('skeleton', name));
      renameSync(path, renamed);
      path = renamed;
    }
    if (entry.isDirectory()) walk(path);
    else writeFileSync(path, rename(readFileSync(path, 'utf8')));
  }
};
walk(target);

console.log(`Created modules/${name} (@arv/${name}). Next:
  1. pnpm install
  2. Add ${pascal}ModuleLive to apps/api/src/composition.ts, in dependency order.
  3. Mount ${camel}Routes in apps/api/src/index.ts and re-export ${pascal}Routes.
  4. Add '${snake}' to schemaFilter in packages/migrations/drizzle.config.ts, then pnpm db:generate.
  5. Add the module and its allowed edges to the module graph in ARCHITECTURE.md.`);
