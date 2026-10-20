import { Effect } from 'effect';
import { UserRepository } from './ports';

export const listUsers = () => Effect.flatMap(UserRepository, (repo) => repo.list());
