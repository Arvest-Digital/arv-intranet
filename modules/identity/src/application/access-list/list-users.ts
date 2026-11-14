import { requirePermission } from '@arv/kernel';
import { Effect } from 'effect';
import { MANAGE_ACCESS } from '../../permissions';
import { type Page, type PageRequest, pageById } from '../page';
import { UserRepository } from '../ports';
import { describeUser, type UserAccess } from './user-access';

/**
 * One page of the access list in id (creation) order, each user with roles and combined
 * permissions (AC-08). Only the page's users are described.
 */
export const listUsers = (request: PageRequest = {}) =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_ACCESS);
    const users = yield* UserRepository;
    const page = pageById(yield* users.list(), request);
    const items = yield* Effect.forEach(page.items, describeUser);
    const described: Page<UserAccess> = { ...page, items };
    return described;
  });
