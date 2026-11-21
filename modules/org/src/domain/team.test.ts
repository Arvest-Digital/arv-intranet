import { EmployeeId } from '@arv/kernel';
import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { TeamHasMembers } from './errors';
import { nameKey, sameName } from './name';
import { checkTeamRemovable, renameTeam, Team, TeamId, TeamName } from './team';

const team = new Team({
  id: TeamId.make('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'),
  name: 'Platform',
  teamLeadId: EmployeeId.make('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c'),
  createdAt: new Date('2026-11-01T10:00:00Z'),
});

describe('team name comparison (AC-19d, compared like AC-24)', () => {
  it('«Platform» and «platform » normalise equal', () => {
    expect(nameKey('Platform')).toBe(nameKey('platform '));
    expect(sameName('Platform', 'platform ')).toBe(true);
  });

  it.each([
    ['Platform', 'platform'],
    ['  Platform  ', 'platform'],
    ['PLATFORM', 'platform'],
    ['Data Platform', 'data platform'],
  ])('%j has the key %j', (name, key) => {
    expect(nameKey(name)).toBe(key);
  });

  it('keeps inner spaces significant', () => {
    expect(sameName('Data Platform', 'DataPlatform')).toBe(false);
  });
});

describe('TeamName', () => {
  const decode = Schema.decodeUnknownEither(TeamName);

  it('trims the name', () => {
    expect(decode('  Platform ')).toEqual(Either.right('Platform'));
  });

  it.each(['', '   '])('refuses the blank name %j', (raw) => {
    expect(Either.isLeft(decode(raw))).toBe(true);
  });

  it('allows 100 characters and refuses 101', () => {
    expect(Either.isRight(decode('a'.repeat(100)))).toBe(true);
    expect(Either.isLeft(decode('a'.repeat(101)))).toBe(true);
  });
});

describe('renameTeam', () => {
  it('changes only the name', () => {
    const renamed = renameTeam(team, Schema.decodeSync(TeamName)('Core Platform'));
    expect(renamed).toMatchObject({
      id: team.id,
      teamLeadId: team.teamLeadId,
      name: 'Core Platform',
    });
  });
});

describe('checkTeamRemovable (AC-19d)', () => {
  it('allows removing a team with no resources', () => {
    expect(checkTeamRemovable(team, 0)).toEqual(Either.right(team));
  });

  it('refuses a team that still has resources, naming how many', () => {
    const result = checkTeamRemovable(team, 3);
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(TeamHasMembers);
      expect(result.left.memberCount).toBe(3);
    }
  });
});
