# General

## Dependencies

- Versions are pinned deliberately (TS <7 for React Router 7, Vitest 4 for the Workers vitest plugin, Effect 3). Don't bump without asking.
- If pnpm's minimum-release-age blocks a dependency, prefer an older version over adding to `minimumReleaseAgeExclude`.

## Boundaries

- Web must never import `@arv/db`; all data goes through the api.

## Before committing

- Run `pnpm lint && pnpm typecheck && pnpm test`. CI (`.github/workflows/ci.yml`) has its triggers commented out, so it won't catch anything.

## Git

- Work on feature branches and open a PR; don't commit directly to `main`.
- Commit messages follow Conventional Commits, e.g. `feat(api): add user search`, `fix(web): ...`.
