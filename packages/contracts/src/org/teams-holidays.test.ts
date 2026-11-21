import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ApiErrorBody } from '../shared';
import { TeamMembersDetails } from './errors';
import {
  PublicHoliday,
  PublicHolidayCreate,
  PublicHolidayListQuery,
  PublicHolidayPage,
} from './public-holidays';
import { Team, TeamChange, TeamCreate, TeamPage } from './teams';

// Examples from docs/features/resource-scheduling/contracts/openapi.yaml (components.examples).
const team = {
  id: '01933b8e-0000-7000-8000-000000000201',
  name: 'Platform',
  teamLead: { id: '01933b8e-0000-7000-8000-000000000301', fullName: 'Test User 1', team: null },
  createdAt: '2026-10-31T09:00:00Z',
};
const teamPage = {
  items: [{ ...team, teamLead: null }],
  hasNext: false,
  hasPrev: false,
  nextCursor: null,
};
const holiday = {
  id: '01933b8e-0000-7000-8000-000000000401',
  holidayDate: '2026-12-28',
  name: 'Test holiday',
  createdAt: '2026-10-31T09:00:00Z',
};
const holidayPage = { items: [holiday], hasNext: false, hasPrev: false, nextCursor: null };
const errorExamples = [
  {
    _tag: 'Conflict',
    code: 'org.duplicate_team_name',
    message: 'A team named «Platform» already exists',
  },
  {
    _tag: 'Conflict',
    code: 'org.team_has_members',
    message: 'The team still has 4 resources',
    details: { memberCount: 4 },
  },
  {
    _tag: 'NotFound',
    code: 'org.team_not_found',
    message: 'Team 01933b8e-0000-7000-8000-000000000201 not found',
  },
  {
    _tag: 'NotFound',
    code: 'org.team_lead_not_found',
    message: 'Employee record 01933b8e-0000-7000-8000-000000000399 not found',
  },
  {
    _tag: 'Conflict',
    code: 'org.duplicate_holiday_date',
    message: '2026-12-28 is already a public holiday',
  },
  {
    _tag: 'NotFound',
    code: 'org.holiday_not_found',
    message: 'Public holiday 01933b8e-0000-7000-8000-000000000401 not found',
  },
];

const decodes = <A, I>(schema: Schema.Schema<A, I>, value: unknown) =>
  Either.isRight(Schema.decodeUnknownEither(schema)(value));

describe('org team and holiday contracts accept the OpenAPI examples', () => {
  it.each([
    ['Team', Team, team],
    ['TeamPage', TeamPage, teamPage],
    ['TeamCreate', TeamCreate, { name: 'Platform', teamLeadId: team.teamLead.id }],
    ['TeamChange', TeamChange, { name: 'Platform Core' }],
    ['PublicHoliday', PublicHoliday, holiday],
    ['PublicHolidayPage', PublicHolidayPage, holidayPage],
    [
      'PublicHolidayCreate',
      PublicHolidayCreate,
      { holidayDate: '2026-12-28', name: 'Test holiday', confirm: false },
    ],
  ] as const)('%s', (_, schema, example) => {
    expect(decodes(schema as Schema.Schema<unknown, unknown>, example)).toBe(true);
  });

  it.each(errorExamples)('error $code', (error) => {
    expect(decodes(ApiErrorBody, { error })).toBe(true);
  });

  it('TeamMembersDetails', () => {
    expect(decodes(TeamMembersDetails, { memberCount: 4 })).toBe(true);
  });
});

describe('org team and holiday request rules', () => {
  it('trims a team name, so «Platform » is «Platform» (AC-19d)', () => {
    const decoded = Schema.decodeUnknownSync(TeamCreate)({
      name: '  Platform ',
      teamLeadId: team.teamLead.id,
    });
    expect(decoded.name).toBe('Platform');
  });

  it.each([
    ['a blank name', { name: '   ', teamLeadId: team.teamLead.id }],
    ['no lead', { name: 'Platform' }],
    ['an unknown field', { name: 'Platform', teamLeadId: team.teamLead.id, colour: 'red' }],
    ['a 101-character name', { name: 'x'.repeat(101), teamLeadId: team.teamLead.id }],
  ])('TeamCreate refuses %s', (_, body) => {
    expect(decodes(TeamCreate, body)).toBe(false);
  });

  it('TeamChange needs a name or a lead (minProperties: 1)', () => {
    expect(decodes(TeamChange, {})).toBe(false);
    expect(decodes(TeamChange, { teamLeadId: team.teamLead.id })).toBe(true);
    expect(decodes(TeamChange, { teamLeadId: null })).toBe(false);
  });

  it.each([
    ['a date that is not a day', { holidayDate: '2026-02-30', name: 'X' }],
    ['a blank name', { holidayDate: '2026-12-28', name: ' ' }],
    ['an unknown field', { holidayDate: '2026-12-28', name: 'X', recurring: true }],
  ])('PublicHolidayCreate refuses %s', (_, body) => {
    expect(decodes(PublicHolidayCreate, body)).toBe(false);
  });

  it('the holiday list query takes a range and a page, never after and before together', () => {
    expect(
      Schema.decodeUnknownSync(PublicHolidayListQuery)({
        from: '2026-01-01',
        to: '2026-12-31',
        limit: '20',
      }),
    ).toEqual({ from: '2026-01-01', to: '2026-12-31', limit: 20 });
    expect(decodes(PublicHolidayListQuery, { from: '2026-13-01' })).toBe(false);
    expect(
      decodes(PublicHolidayListQuery, {
        after: holiday.id,
        before: holiday.id,
      }),
    ).toBe(false);
  });
});
