import { requirePermission } from '@arv/kernel';
import { Effect } from 'effect';
import { MANAGE_EMPLOYEE_RECORDS } from '../../permissions';
import { type PageRequest, pageById } from '../page';
import { EmployeeRecordRepository } from '../ports';

/** One page of employee records in id (creation) order (deny by default, PRD §6.1). */
export const listEmployeeRecords = (page: PageRequest = {}) =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_EMPLOYEE_RECORDS);
    const records = yield* EmployeeRecordRepository;
    return pageById(yield* records.list(), page);
  });
