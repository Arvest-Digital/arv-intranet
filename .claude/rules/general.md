# General

Read `ARCHITECTURE.md` before any structural change (new module, package, layer, cross-module call, event, table). Update it in the same PR when the architecture changes.

## Dependencies

- Versions are pinned deliberately (TS <7 for React Router 7, Vitest 4 for the Workers vitest plugin, Effect 3). Don't bump without asking.
- If pnpm's minimum-release-age blocks a dependency, prefer an older version over adding to `minimumReleaseAgeExclude`.
- Don't add a new tool or package (e.g. dependency-cruiser) without asking.

## Boundaries

- Package direction: `apps → modules → @arv/platform → @arv/db · @arv/kernel · @arv/contracts`. Never import upward. No package imports from `apps/*`.
- Modules talk to each other only through the other module's facade (root export of `@arv/<module>`). Never import another module's internals, tables, repositories or `./layer`.
- A new edge between modules must be added to the `module-graph` block in `ARCHITECTURE.md` (checked by `pnpm check:modules`). Ask before adding one; never add a cycle.
- Web must never import `@arv/db`, `@arv/kernel`, `@arv/platform` or any module package; it uses `@arv/contracts/*` and `import type` from `@arv/api`.
- Put code in the module that owns the business capability. If no module owns it, ask instead of putting it in `@arv/platform` or `@arv/kernel`.
- Layer rules are enforced by Biome overrides in `biome.json`. Don't silence `noRestrictedImports`; fix the import or ask.

## Before committing

- Run `pnpm lint && pnpm typecheck && pnpm test` (`lint` includes the module graph check). CI runs on PRs and pushes to `main`.
- Changed a repository adapter, table or migration? Also run `pnpm test:integration` (needs docker).

## Git

- Work on feature branches and open a PR; don't commit directly to `main`.
- Commit messages follow Conventional Commits with the module or package as scope, e.g. `feat(identity): add user search`, `fix(platform): ...`, `fix(web): ...`.
