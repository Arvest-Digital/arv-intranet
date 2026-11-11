import type { IdentityRoutes } from '@arv/api';
import {
  type AdminContact,
  IdentityErrorCodes,
  Me,
  NotOnAccessListDetails,
  Session,
  type SignInCompletion,
  SignInRedirect,
  type UserCreate,
  UserPage,
  UserWithAccessRoles,
} from '@arv/contracts/identity';
import { Option, Schema } from 'effect';
import { hc } from 'hono/client';
import { API_BASE_URL, type ApiResult, bindingFetch, failure } from '../../shared/lib/api.server';

const decodeUserPage = Schema.decodeUnknownSync(UserPage);
const decodeUser = Schema.decodeUnknownSync(UserWithAccessRoles);
const decodeSignInRedirect = Schema.decodeUnknownSync(SignInRedirect);
const decodeSession = Schema.decodeUnknownSync(Session);
const decodeMe = Schema.decodeUnknownSync(Me);
const decodeNotSetUp = Schema.decodeUnknownOption(NotOnAccessListDetails);

/** How Google's return ended (sad §6 Critical flow 1): each outcome has its own screen. */
export type SignInOutcome =
  | { readonly kind: 'signed-in'; readonly session: Session }
  /** Not a verified, company-managed account on the company domain (AC-02). */
  | { readonly kind: 'refused' }
  /** A verified company account not on the access list, with the admins to ask (AC-03). */
  | { readonly kind: 'not-set-up'; readonly admins: ReadonlyArray<AdminContact> }
  | { readonly kind: 'failed'; readonly status: number; readonly message: string };

/**
 * Identity API calls for loaders and actions. `sessionToken` (from `getSessionToken`) is forwarded
 * as `Authorization: Bearer`; pass null for the public sign-in calls. Responses are decoded with
 * the contract schemas.
 */
export function identityGateway(api: Fetcher, sessionToken: string | null) {
  const client = hc<IdentityRoutes>(API_BASE_URL, { fetch: bindingFetch(api, sessionToken) });

  return {
    async beginSignIn(): Promise<ApiResult<SignInRedirect>> {
      const res = await client.identity['sign-in'].begin.$post();
      if (!res.ok) return failure(res, 'Could not start sign-in');
      return { ok: true, value: decodeSignInRedirect(await res.json()) };
    },

    async completeSignIn(input: SignInCompletion): Promise<SignInOutcome> {
      const res = await client.identity['sign-in'].complete.$post({ json: input });
      if (res.ok) return { kind: 'signed-in', session: decodeSession(await res.json()) };

      const failed = await failure(res, 'Could not complete sign-in');
      switch (failed.code) {
        case IdentityErrorCodes.signInRefused:
          return { kind: 'refused' };
        case IdentityErrorCodes.notOnAccessList:
          return {
            kind: 'not-set-up',
            admins: decodeNotSetUp(failed.details).pipe(
              Option.map((details) => details.admins),
              Option.getOrElse(() => []),
            ),
          };
        default:
          return { kind: 'failed', status: failed.status, message: failed.message };
      }
    },

    /** Who is signed in and what they may do; 401 when the session is missing or ended. */
    async getMe(): Promise<ApiResult<Me>> {
      const res = await client.identity.me.$get();
      if (!res.ok) return failure(res, 'Could not load who is signed in');
      return { ok: true, value: decodeMe(await res.json()) };
    },

    /** Ends this session in the api (AC-20). */
    async signOut(): Promise<ApiResult<null>> {
      const res = await client.identity['sign-out'].$post();
      if (!res.ok) return failure(res, 'Could not sign out');
      return { ok: true, value: null };
    },

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
