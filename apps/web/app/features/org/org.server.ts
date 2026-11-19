import type { IdentityRoutes, OrgRoutes } from '@arv/api';
import { PAGE_LIMIT_MAX, UserPage } from '@arv/contracts/identity';
import {
  EmployeeRecord,
  type EmployeeRecordChange,
  type EmployeeRecordCreate,
  EmployeeRecordPage,
  type Team,
  TeamPage,
} from '@arv/contracts/org';
import { Schema } from 'effect';
import { hc } from 'hono/client';
import { API_BASE_URL, type ApiResult, bindingFetch, failure } from '../../shared/lib/api.server';
import type { Login } from './employee-record';

const decodeRecordPage = Schema.decodeUnknownSync(EmployeeRecordPage);
const decodeRecord = Schema.decodeUnknownSync(EmployeeRecord);
const decodeTeamPage = Schema.decodeUnknownSync(TeamPage);
const decodeUserPage = Schema.decodeUnknownSync(UserPage);

type Page<A> = {
  readonly items: ReadonlyArray<A>;
  readonly hasNext: boolean;
  readonly nextCursor: string | null;
};

/** Follows a cursor list to its end (records, teams and logins number in the hundreds at most). */
async function everyPage<A>(
  fetchPage: (after: string | undefined) => Promise<ApiResult<Page<A>>>,
): Promise<ApiResult<ReadonlyArray<A>>> {
  const items: A[] = [];
  let after: string | undefined;
  for (;;) {
    const page = await fetchPage(after);
    if (!page.ok) return page;
    items.push(...page.value.items);
    if (!page.value.hasNext || !page.value.nextCursor) return { ok: true, value: items };
    after = page.value.nextCursor;
  }
}

const pageQuery = (after: string | undefined) => ({
  limit: PAGE_LIMIT_MAX,
  ...(after ? { after } : {}),
});

/**
 * Org API calls for loaders and actions (employee records and teams). `sessionToken` is forwarded
 * as `Authorization: Bearer`. Responses are decoded with the contract schemas.
 */
export function orgGateway(api: Fetcher, sessionToken: string | null) {
  const fetch = bindingFetch(api, sessionToken);
  const client = hc<OrgRoutes>(API_BASE_URL, { fetch });
  // The login picker lists the access list; only holders of identity's manage-access may read it.
  const identity = hc<IdentityRoutes>(API_BASE_URL, { fetch });

  return {
    /** Every employee record in creation order (AC-22: 403 without manage-employee-records). */
    listEmployeeRecords(): Promise<ApiResult<ReadonlyArray<EmployeeRecord>>> {
      return everyPage(async (after) => {
        const res = await client.org['employee-records'].$get({ query: pageQuery(after) });
        if (!res.ok) return failure(res, 'Could not load the employee records');
        return { ok: true, value: decodeRecordPage(await res.json()) };
      });
    },

    /** Every team, for the record's team choice and the list's team filter. */
    listTeams(): Promise<ApiResult<ReadonlyArray<Team>>> {
      return everyPage(async (after) => {
        const res = await client.org.teams.$get({ query: pageQuery(after) });
        if (!res.ok) return failure(res, 'Could not load the teams');
        return { ok: true, value: decodeTeamPage(await res.json()) };
      });
    },

    /** The intranet logins a record can be linked to: everyone on the access list. */
    listLogins(): Promise<ApiResult<ReadonlyArray<Login>>> {
      return everyPage(async (after) => {
        const res = await identity.users.$get({ query: pageQuery(after) });
        if (!res.ok) return failure(res, 'Could not load the intranet logins');
        const page = decodeUserPage(await res.json());
        return {
          ok: true,
          value: {
            ...page,
            items: page.items.map(({ id, name, email }) => ({ id, name, email })),
          },
        };
      });
    },

    /** Creates a record; one without hours or a start date is saved as incomplete (AC-19a, AC-06). */
    async createEmployeeRecord(input: EmployeeRecordCreate): Promise<ApiResult<EmployeeRecord>> {
      const res = await client.org['employee-records'].$post({
        json: { ...input, ...(input.workingDays ? { workingDays: [...input.workingDays] } : {}) },
      });
      if (!res.ok) return failure(res, 'Could not create the employee record');
      return { ok: true, value: decodeRecord(await res.json()) };
    },

    /**
     * Edits a record at the version the form was opened at (AC-19, AC-21). A capacity drop that
     * would overbook a week answers 409 until it is resent with `confirm: true` (AC-19c).
     */
    async updateEmployeeRecord(
      employeeRecordId: string,
      change: EmployeeRecordChange,
    ): Promise<ApiResult<EmployeeRecord>> {
      const res = await client.org['employee-records'][':employeeRecordId'].$patch({
        param: { employeeRecordId },
        json: {
          ...change,
          ...(change.workingDays ? { workingDays: [...change.workingDays] } : {}),
        },
      });
      if (!res.ok) return failure(res, 'Could not save the employee record');
      return { ok: true, value: decodeRecord(await res.json()) };
    },
  };
}
