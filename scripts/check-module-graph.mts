/**
 * Fails when a module depends on another module that ARCHITECTURE.md doesn't allow, when a module
 * is missing from the graph, or when the declared graph has a cycle. Runs as part of `pnpm lint`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

const architecture = readFileSync(join(root, 'ARCHITECTURE.md'), 'utf8');
const block = /<!-- module-graph:start -->([\s\S]*?)<!-- module-graph:end -->/.exec(architecture);
if (!block?.[1]) {
  console.error('ARCHITECTURE.md has no <!-- module-graph:start/end --> block');
  process.exit(1);
}

/** module → modules it may call through their facade. Lines look like `- org → identity`. */
const allowed = new Map<string, Set<string>>();
for (const line of block[1].split('\n')) {
  const match = /^-\s*`?([a-z0-9-]+)`?\s*→\s*(.*)$/.exec(line.trim());
  if (!match?.[1]) continue;
  const targets = (match[2] ?? '')
    .split(',')
    .map((target) => target.replaceAll('`', '').trim())
    .filter((target) => target && target !== '(none)');
  allowed.set(match[1], new Set(targets));
}

const modules = readdirSync(join(root, 'modules'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => entry.name);

const problems: string[] = [];
for (const name of modules) {
  const pkg = JSON.parse(readFileSync(join(root, 'modules', name, 'package.json'), 'utf8'));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    .filter((dep) => dep.startsWith('@arv/'))
    .map((dep) => dep.slice('@arv/'.length))
    .filter((dep) => modules.includes(dep));
  const edges = allowed.get(name);
  if (!edges) {
    problems.push(`${name}: missing from the module graph in ARCHITECTURE.md`);
    continue;
  }
  for (const dep of deps) {
    if (!edges.has(dep)) problems.push(`${name} → ${dep}: edge not allowed in ARCHITECTURE.md`);
  }
}

const visit = (name: string, path: string[]) => {
  if (path.includes(name)) {
    problems.push(`cycle in the declared graph: ${[...path, name].join(' → ')}`);
    return;
  }
  for (const next of allowed.get(name) ?? []) visit(next, [...path, name]);
};
for (const name of allowed.keys()) visit(name, []);

if (problems.length > 0) {
  console.error(`Module graph check failed:\n  ${[...new Set(problems)].join('\n  ')}`);
  process.exit(1);
}
console.log(`Module graph OK (${modules.length} module${modules.length === 1 ? '' : 's'}).`);
