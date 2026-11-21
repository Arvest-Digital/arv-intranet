import { type EmployeeId, requirePermission } from '@arv/kernel';
import { Effect, Option } from 'effect';
import { EmployeeRecordNotFound } from '../../domain/errors';
import { MANAGE_EMPLOYEE_RECORDS } from '../../permissions';
import { EmployeeRecordRepository } from '../ports';

/** One record with the `version` its edit form must send back (deny by default, PRD §6.1). */
export const getEmployeeRecord = (id: EmployeeId) =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_EMPLOYEE_RECORDS);
    const records = yield* EmployeeRecordRepository;
    const record = yield* records.findById(id);
    if (Option.isNone(record)) return yield* new EmployeeRecordNotFound({ id });
    return record.value;
  });
