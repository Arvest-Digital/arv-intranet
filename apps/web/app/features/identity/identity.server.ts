import type { IdentityRoutes } from '@arv/api';
import { type CreateUserInput, User } from '@arv/contracts/identity';
import { Schema } from 'effect';
import { hc } from 'hono/client';
import { API_BASE_URL, type ApiResult, bindingFetch, failure } from '../../shared/lib/api.server';

const decodeUsers = Schema.decodeUnknownSync(Schema.Array(User));
const decodeUser = Schema.decodeUnknownSync(User);

/** Identity API calls for loaders and actions. Responses are decoded with the contract schemas. */
export function identityGateway(api: Fetcher) {
  const client = hc<IdentityRoutes>(API_BASE_URL, { fetch: bindingFetch(api) });

  return {
    async listUsers(): Promise<ApiResult<ReadonlyArray<User>>> {
      const res = await client.users.$get();
      if (!res.ok) return failure(res, 'Could not load users');
      return { ok: true, value: decodeUsers(await res.json()) };
    },

    async createUser(input: typeof CreateUserInput.Encoded): Promise<ApiResult<User>> {
      const res = await client.users.$post({ json: input });
      if (!res.ok) return failure(res, 'Could not create user');
      return { ok: true, value: decodeUser(await res.json()) };
    },
  };
}
