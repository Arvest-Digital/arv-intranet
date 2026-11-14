// k6 load test for identity's latency targets at 100 users and 50 access roles
// (PRD §6 Capacity headroom, sad §10 Scenario 2c). Runs against the api Worker under
// `wrangler dev`, seeded by `load/seed.ts`. Locally (docker Postgres up, k6 installed), from e2e/:
//   pnpm load:seed && (pnpm load:api &) && pnpm load:run
// k6 exits non-zero when a threshold is crossed.
//
// Thresholds are PRD §6 verbatim. Local Postgres is faster than Neon through Hyperdrive, so a
// pass here is a lower bound; production `accessCheckMs` stays the source of truth.

import { check } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';
import { Trend } from 'k6/metrics';

const API_URL = __ENV.API_URL || 'http://localhost:8787';
const seed = JSON.parse(open('./.out/seed.json'));

/** The access-check step alone, read from the api's `Server-Timing: accessCheck;dur=…`. */
const accessCheck = new Trend('access_check', true);
/** Within it, opening the request's Postgres connection (`dbConnect`), which the request reuses. */
const dbConnect = new Trend('db_connect', true);
/**
 * The check without the connection (`accessCheck − dbConnect`). Reported only: whether the 25 ms
 * target applies to this or to `access_check` is the Tech Lead's call (T28 notes).
 */
const accessCheckQuery = new Trend('access_check_query', true);

export const options = {
  scenarios: {
    // Every intranet request pays the access check: signed-in users reading `me`.
    access_check: {
      executor: 'constant-vus',
      exec: 'accessCheckScenario',
      vus: 10,
      duration: '30s',
    },
    // The company's 1-2 admins doing the admin access actions of PRD §6.
    admin_actions: {
      executor: 'per-vu-iterations',
      exec: 'adminScenario',
      vus: seed.admins.length,
      iterations: 25,
      maxDuration: '60s',
    },
    // Sign-in completion (≤ 800 ms p95 on the sign-in return request) is PENDING: it needs a
    // Google test double that cannot be selected in production, awaiting the Security Lead's
    // decision (T28 notes). Add its scenario and threshold here once agreed.
  },
  thresholds: {
    // PRD §6: access check added to every request ≤ 25 ms p95.
    access_check: ['p(95)<=25'],
    // PRD §6: admin access actions (add/remove user, save access role, assign access role) ≤ 500 ms p95.
    'http_req_duration{kind:admin}': ['p(95)<=500'],
    // A scenario that sent nothing must not pass its latency threshold.
    'http_reqs{kind:admin}': ['count>0'],
    // Fast failures are not a pass: every response must be the expected one.
    checks: ['rate==1'],
  },
};

const pick = (items) => items[Math.floor(Math.random() * items.length)];

const headers = (token) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

/** Reads `dur` of the `name` entry from a Server-Timing header, or `undefined`. */
const timing = (res, name) => {
  const match = new RegExp(`(?:^|,)\\s*${name};dur=([\\d.]+)`).exec(
    res.headers['Server-Timing'] || '',
  );
  return match ? Number(match[1]) : undefined;
};

export function accessCheckScenario() {
  const res = http.get(`${API_URL}/identity/me`, { headers: headers(pick(seed.userTokens)) });
  const ms = timing(res, 'accessCheck');
  const connectMs = timing(res, 'dbConnect');
  check(res, {
    'me is 200': (r) => r.status === 200,
    'me reports accessCheck in Server-Timing': () => ms !== undefined,
    'me reports dbConnect in Server-Timing': () => connectMs !== undefined,
  });
  if (ms !== undefined) accessCheck.add(ms);
  if (connectMs !== undefined) dbConnect.add(connectMs);
  if (ms !== undefined && connectMs !== undefined) accessCheckQuery.add(ms - connectMs);
}

export function adminScenario() {
  // `__VU` counts across all scenarios, so spread this scenario's iterations over the admins.
  const admin = seed.admins[exec.scenario.iterationInTest % seed.admins.length];
  const params = { headers: headers(admin.token), tags: { kind: 'admin' } };
  const json = (body) => JSON.stringify(body);
  const unique = `${exec.scenario.iterationInTest}-${Date.now()}`;

  // Add a user with an access role.
  const added = http.post(
    `${API_URL}/users`,
    json({
      email: `load-${unique}@example.test`,
      name: `Load User ${unique}`,
      accessRoleIds: [pick(seed.roleIds)],
    }),
    { ...params, tags: { kind: 'admin', action: 'add-user' } },
  );
  if (!check(added, { 'add user is 201': (r) => r.status === 201 })) return;
  const userId = added.json('id');

  // Assign access roles.
  const assigned = http.put(
    `${API_URL}/users/${userId}/access-roles`,
    json({ accessRoleIds: [pick(seed.roleIds), admin.scratchRoleId] }),
    { ...params, tags: { kind: 'admin', action: 'assign-roles' } },
  );
  check(assigned, { 'assign roles is 200': (r) => r.status === 200 });

  // Save an access role.
  const saved = http.put(
    `${API_URL}/identity/access-roles/${admin.scratchRoleId}`,
    json({ name: `Load Role ${unique}`, permissionKeys: [] }),
    { ...params, tags: { kind: 'admin', action: 'save-role' } },
  );
  check(saved, { 'save role is 200': (r) => r.status === 200 });

  // Remove the user.
  const removed = http.del(`${API_URL}/users/${userId}`, null, {
    ...params,
    tags: { kind: 'admin', action: 'remove-user' },
  });
  check(removed, { 'remove user is 204': (r) => r.status === 204 });
}
