import type { EmployeeRecord, Team } from '@arv/contracts/org';
import type { Login } from './employee-record';

/** Decoded org data for the employee-record screens' tests. */

export const planner = { id: '7a1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e01', name: 'Andrii Melnyk' };

export const platform: Team = {
  id: '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a01',
  name: 'Platform',
  teamLead: null,
  createdAt: new Date('2026-01-10T10:00:00.000Z'),
};
export const design: Team = {
  ...platform,
  id: '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a02',
  name: 'Design',
};
export const teams = [platform, design];

export const olenaLogin: Login = {
  id: '6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e11',
  name: 'Olena Kovalenko',
  email: 'olena.kovalenko@arvest.digital',
};
export const markoLogin: Login = {
  id: '6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e12',
  name: 'Marko Ivanov',
  email: 'marko.ivanov@arvest.digital',
};
export const logins = [olenaLogin, markoLogin];

export const olena: EmployeeRecord = {
  id: '3c4d5e6f-7081-4923-a4b5-c6d7e8f90a01',
  fullName: 'Olena Kovalenko',
  userId: olenaLogin.id,
  team: { id: platform.id, name: platform.name },
  contractMinutes: 2400,
  workingDays: [1, 2, 3, 4, 5],
  employmentStart: '2023-02-01',
  employmentEnd: null,
  incomplete: false,
  version: 3,
  lastChangedBy: planner,
  lastChangedAt: new Date('2026-11-10T10:00:00.000Z'),
  createdAt: new Date('2023-01-20T10:00:00.000Z'),
};

export const kateryna: EmployeeRecord = {
  ...olena,
  id: '3c4d5e6f-7081-4923-a4b5-c6d7e8f90a02',
  fullName: 'Kateryna Shevchuk',
  userId: null,
  team: null,
  contractMinutes: null,
  workingDays: [1, 2, 3],
  employmentStart: '2026-11-02',
  incomplete: true,
  version: 1,
};

/** A record as the api sends it: dates as strings. */
export const encoded = (record: EmployeeRecord) => ({
  ...record,
  lastChangedAt: record.lastChangedAt.toISOString(),
  createdAt: record.createdAt.toISOString(),
});

export const encodedTeam = (team: Team) => ({ ...team, createdAt: team.createdAt.toISOString() });

export const page = (items: unknown[], extra = {}) => ({
  items,
  hasNext: false,
  hasPrev: false,
  nextCursor: null,
  ...extra,
});
