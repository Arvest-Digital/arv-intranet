import type { EmployeeId } from '@arv/kernel';
import { Effect, Option } from 'effect';
import { TeamLeadNotFound } from '../../domain/errors';
import { EmployeeRecordRepository } from '../ports';

/** A team's lead must be a resource: an existing employee record (AC-19d, flow 10 precondition). */
export const requireTeamLead = (teamLeadId: EmployeeId) =>
  Effect.gen(function* () {
    const records = yield* EmployeeRecordRepository;
    if (Option.isNone(yield* records.findById(teamLeadId))) {
      return yield* new TeamLeadNotFound({ id: teamLeadId });
    }
  });
