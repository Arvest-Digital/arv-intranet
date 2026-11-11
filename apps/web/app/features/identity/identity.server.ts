import type { IdentityRoutes } from '@arv/api';
import { type UserCreate, UserPage, UserWithAccessRoles } from '@arv/contracts/identity';
import { Schema } from 'effect';
import { hc } from 'hono/client';
import { API_BASE_URL, type ApiResult, bindingFetch, failure } from '../../shared/lib/api.server';

const decodeUserPage = Schema.decodeUnknownSync(UserPage);
const decodeUser = Schema.decodeUnknownSync(UserWithAccessRoles);

/** Identity API calls for loaders and actions. Responses are decoded with the contract schemas. */
export function identityGateway(api: Fetcher) {
  const client = hc<IdentityRoutes>(API_BASE_URL, { fetch: bindingFetch(api) });

  return {
    // TODO(identity T25): pages beyond the first; the scaffold screen shows the first 50 only.
    async listUsers(): Promise<ApiResult<ReadonlyArray<UserWithAccessRoles>>> {
      const res = await client.users.$get({ query: {} });
      if (!res.ok) return failure(res, 'Could not load users');
      return { ok: true, value: decodeUserPage(await res.json()).items };
    },

    async createUser(input: UserCreate): Promise<ApiResult<UserWithAccessRoles>> {
      const res = await client.users.$post({ json: input });
      if (!res.ok) return failure(res, 'Could not create user');
      return { ok: true, value: decodeUser(await res.json()) };
    },
  };
}
