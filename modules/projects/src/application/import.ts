import { Effect, Option } from 'effect';
import {
  type Project,
  type ProjectName,
  type ProjectNameKey,
  type ProjectType,
  projectNameKey,
} from '../domain/project';
import { ProjectRepository } from './ports';

/** A project as the spreadsheet names it (flow 13). */
export interface ImportedProject {
  readonly name: ProjectName;
  readonly type: ProjectType;
}

/** A project the import named: an open one it matched, or one it created. */
export interface ImportedProjectResult {
  readonly project: Project;
  readonly created: boolean;
}

/**
 * Flow 13, AC-30: creates the import's projects as open (AC-23). Runs inside the caller's
 * `UnitOfWork` and opens none of its own, so it commits or rolls back with the rest of the import
 * (ADR-0006); called outside one, each write commits alone.
 *
 * - A name matching a project open on `today` (ignoring case and surrounding spaces, AC-24) reuses
 *   that project as it is, type included; a closed project's name is free, so a new one is made.
 * - Names repeated in `projects` count once (the first spelling and type win).
 * - Returns one entry per distinct name key, in order of first mention.
 * - No permission check: the caller's import use case has already checked all three (AC-33).
 */
export const importProjects = (projects: ReadonlyArray<ImportedProject>, today: string) =>
  Effect.gen(function* () {
    const repository = yield* ProjectRepository;
    const results = new Map<ProjectNameKey, ImportedProjectResult>();
    for (const { name, type } of projects) {
      const key = projectNameKey(name);
      if (results.has(key)) continue;
      const open = yield* repository.findOpenByNameKey(key, today);
      results.set(
        key,
        Option.isSome(open)
          ? { project: open.value, created: false }
          : { project: yield* repository.create({ name, type }), created: true },
      );
    }
    return [...results.values()];
  });
