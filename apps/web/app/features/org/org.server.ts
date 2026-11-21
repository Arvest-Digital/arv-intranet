import type { IdentityRoutes, OrgRoutes } from '@arv/api';
import { PAGE_LIMIT_MAX, UserPage } from '@arv/contracts/identity';
import {
  EmployeeRecord,
  type EmployeeRecordChange,
  type EmployeeRecordCreate,
  EmployeeRecordPage,
  PublicHoliday,
  PublicHolidayPage,
  Team,
  TeamPage,
} from '@arv/contracts/org';
import { Schema } from 'effect';
import { hc } from 'hono/client';
import { API_BASE_URL, type ApiResult, bindingFetch, failure } from '../../shared/lib/api.server';
import type { Login } from './employee-record';

const decodeRecordPage = Schema.decodeUnknownSync(EmployeeRecordPage);
const decodeRecord = Schema.decodeUnknownSync(EmployeeRecord);
const decodeTeamPage = Schema.decodeUnknownSync(TeamPage);
const decodeTeam = Schema.decodeUnknownSync(Team);
const decodeHolidayPage = Schema.decodeUnknownSync(PublicHolidayPage);
const decodeHoliday = Schema.decodeUnknownSync(PublicHoliday);
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
 * Org API calls for loaders and actions (employee records, teams and public holidays). `sessionToken` is forwarded
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

    /** Creates a team with its lead (AC-19d); a name another team has answers 409. */
    async createTeam(name: string, teamLeadId: string): Promise<ApiResult<Team>> {
      const res = await client.org.teams.$post({ json: { name, teamLeadId } });
      if (!res.ok) return failure(res, 'Could not create the team');
      return { ok: true, value: decodeTeam(await res.json()) };
    },

    /** Renames a team or changes its lead (AC-19d). */
    async updateTeam(
      teamId: string,
      change: { readonly name?: string; readonly teamLeadId?: string },
    ): Promise<ApiResult<Team>> {
      const res = await client.org.teams[':teamId'].$patch({ param: { teamId }, json: change });
      if (!res.ok) return failure(res, 'Could not save the team');
      return { ok: true, value: decodeTeam(await res.json()) };
    },

    /** Removes a team; one that still has resources answers 409 with how many (AC-19d). */
    async removeTeam(teamId: string): Promise<ApiResult<null>> {
      const res = await client.org.teams[':teamId'].$delete({ param: { teamId } });
      if (!res.ok) return failure(res, 'Could not remove the team');
      return { ok: true, value: null };
    },

    /** Every public holiday from `from` to `to`, both included, by date (US-09). */
    listPublicHolidays(from: string, to: string): Promise<ApiResult<ReadonlyArray<PublicHoliday>>> {
      return everyPage(async (after) => {
        const res = await client.org['public-holidays'].$get({
          query: { ...pageQuery(after), from, to },
        });
        if (!res.ok) return failure(res, 'Could not load the public holidays');
        return { ok: true, value: decodeHolidayPage(await res.json()) };
      });
    },

    /**
     * Adds a holiday (AC-27). One that would overbook weeks answers 409 until it is resent with
     * `confirm: true` (AC-19c); without manage-holiday-list it answers 403 (AC-28).
     */
    async addPublicHoliday(input: {
      readonly holidayDate: string;
      readonly name: string;
      readonly confirm?: boolean;
    }): Promise<ApiResult<PublicHoliday>> {
      const res = await client.org['public-holidays'].$post({ json: input });
      if (!res.ok) return failure(res, 'Could not add the public holiday');
      return { ok: true, value: decodeHoliday(await res.json()) };
    },

    /** Removes a holiday (AC-27, AC-28). */
    async removePublicHoliday(publicHolidayId: string): Promise<ApiResult<null>> {
      const res = await client.org['public-holidays'][':publicHolidayId'].$delete({
        param: { publicHolidayId },
      });
      if (!res.ok) return failure(res, 'Could not remove the public holiday');
      return { ok: true, value: null };
    },
  };
}
