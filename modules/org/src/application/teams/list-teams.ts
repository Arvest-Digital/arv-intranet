import { Permission } from '@arv/kernel';
import { Effect } from 'effect';
import { MANAGE_EMPLOYEE_RECORDS } from '../../permissions';
import { requireAnyPermission } from '../access';
import { type PageRequest, pageById } from '../page';
import { TeamRepository } from '../ports';

/**
 * Who may list teams (openapi `listTeams`, api-sync-report D-5): team maintenance (AC-19d) and
 * the board's team filter (AC-02). The scheduling keys are spelled out here because org can't
 * import scheduling (it calls org). A renamed key fails closed. See TODO.md.
 */
export const TEAM_LIST_READERS = [
  MANAGE_EMPLOYEE_RECORDS,
  Permission.make('scheduling:view-whole-board'),
  Permission.make('scheduling:edit-allocations'),
] as const;

/**
 * A page of teams in id (creation) order. Missing all of `TEAM_LIST_READERS` →
 * `PermissionDenied`, nothing read.
 */
export const listTeams = (page: PageRequest = {}) =>
  Effect.gen(function* () {
    yield* requireAnyPermission(TEAM_LIST_READERS);
    const teams = yield* TeamRepository;
    const all = yield* teams.list();
    return pageById(
      all.map(({ team }) => team),
      page,
    );
  });
