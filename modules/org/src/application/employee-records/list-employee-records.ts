import { requirePermission } from '@arv/kernel';
import { Effect } from 'effect';
import { MANAGE_EMPLOYEE_RECORDS } from '../../permissions';
import { EmployeeRecordRepository } from '../ports';

/** Every employee record, by full name (deny by default, PRD §6.1). */
export const listEmployeeRecords = () =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_EMPLOYEE_RECORDS);
    const records = yield* EmployeeRecordRepository;
    return yield* records.list();
  });
