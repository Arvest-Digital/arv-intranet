// @vitest-environment node
// Server code: Node's own File and FormData, as in the Worker (jsdom's File isn't one).
import { describe, expect, it } from 'vitest';
import { fakeApi, json } from '../../../test/fake-api';
import { IMPORT_MESSAGE } from '../import';
import { action, loader } from './import';

const WEB = 'http://web.test';

const apiError = (_tag: string, code: string, message: string, status: number, details?: unknown) =>
  json({ error: { _tag, code, message, ...(details ? { details } : {}) } }, status);

/** The result a route returned with `data()` carries its body in `.data`. */
const body = (result: unknown) =>
  (result as { data?: unknown }).data ?? (result as Record<string, unknown>);
const status = (result: unknown) => (result as { init?: { status?: number } }).init?.status;

const RUN = {
  id: '01933b8e-0000-7000-8000-000000000901',
  importedBy: { id: '01933b8e-0000-7000-8000-000000000202', name: 'Andrii Melnyk' },
  employeeRecordsCreated: 42,
  projectsCreated: 12,
  allocationsCreated: 168,
  createdAt: '2026-12-02T10:00:00.000Z',
};

const CSV =
  'Employee,Project,Start,End,Hours\nOlena Kovalenko,Atlas CRM,2026-12-07,2026-12-18,20\n';

const load = (api: ReturnType<typeof fakeApi>) =>
  loader({ context: api.context, params: {}, request: new Request(`${WEB}/import`) } as never);

const upload = (api: ReturnType<typeof fakeApi>, fields: { file?: File; confirm?: string }) => {
  const form = new FormData();
  if (fields.file) form.set('file', fields.file);
  if (fields.confirm) form.set('confirm', fields.confirm);
  return action({
    context: api.context,
    params: {},
    request: new Request(`${WEB}/import`, {
      method: 'POST',
      headers: { Origin: WEB },
      body: form,
    }),
  } as never);
};

const csv = () => new File([CSV], 'planning-2026.csv', { type: 'text/csv' });

const missing = () =>
  apiError(
    'Forbidden',
    'scheduling.missing_permission',
    'You lack the permissions manage employee records and manage projects',
    403,
    { missingPermissions: ['org:manage-employee-records', 'projects:manage-projects'] },
  );

describe('import loader', () => {
  it('answers whether the import ran, with its run (AC-32)', async () => {
    const api = fakeApi(() => json({ completed: true, run: RUN }));
    const result = (await load(api)) as { kind: string; status: { run: { createdAt: Date } } };
    expect(result.kind).toBe('status');
    expect(result.status.run.createdAt).toEqual(new Date(RUN.createdAt));
    expect(new URL(api.requests[0]!.url).pathname).toBe('/scheduling/import');
  });

  it('names every missing permission (AC-33)', async () => {
    const result = await load(fakeApi(missing));
    expect(status(result)).toBe(403);
    expect(body(result)).toEqual({
      kind: 'perms',
      missing: ['org:manage-employee-records', 'projects:manage-projects'],
    });
  });
});

describe('import action', () => {
  it('uploads the file unconfirmed and answers the preview (AC-30)', async () => {
    const preview = {
      employeeRecordsToCreate: 42,
      projectsToCreate: 12,
      allocationsToCreate: 168,
      incompleteRecords: 3,
      overbookedWeeks: [{ fullName: 'Olena Kovalenko', weekStart: '2026-12-07', overMinutes: 240 }],
    };
    const api = fakeApi(() =>
      apiError(
        'ConfirmationRequired',
        'scheduling.import_confirmation_required',
        'Confirm to import',
        409,
        preview,
      ),
    );
    const result = await upload(api, { file: csv() });
    expect(body(result)).toEqual({ kind: 'preview', preview });
    const sent = api.requests[0]!;
    expect(sent.method).toBe('POST');
    expect(new URL(sent.url).pathname).toBe('/scheduling/import');
    const form = await sent.formData();
    expect(form.get('confirm')).toBe('false');
    expect(await (form.get('file') as File).text()).toBe(CSV);
  });

  it('sends the same file again with confirm and answers the run (AC-30)', async () => {
    const api = fakeApi(() => json(RUN, 201));
    const result = (await upload(api, { file: csv(), confirm: 'true' })) as {
      kind: string;
      run: { allocationsCreated: number };
    };
    expect(result.kind).toBe('success');
    expect(result.run.allocationsCreated).toBe(168);
    const form = await api.requests[0]!.formData();
    expect(form.get('confirm')).toBe('true');
    expect(await (form.get('file') as File).text()).toBe(CSV);
  });

  it('lists the problem rows (AC-31)', async () => {
    const rows = [
      { row: 8, reason: 'empty_hours', message: 'Hours are empty' },
      { row: 15, reason: 'end_before_start', message: 'End 2026-12-01 is before start 2026-12-07' },
    ];
    const api = fakeApi(() =>
      apiError('ValidationError', 'scheduling.import_problem_rows', '2 rows need fixing', 400, {
        rows,
      }),
    );
    const result = await upload(api, { file: csv() });
    expect(status(result)).toBe(400);
    expect(body(result)).toEqual({ kind: 'problems', rows });
  });

  it('says the import ran already (AC-32)', async () => {
    const api = fakeApi(() =>
      apiError(
        'Conflict',
        'scheduling.import_already_completed',
        'The import is one-time; make later changes on the board',
        409,
        { completedAt: RUN.createdAt },
      ),
    );
    expect(body(await upload(api, { file: csv() }))).toEqual({
      kind: 'completed',
      completedAt: new Date(RUN.createdAt),
    });
  });

  it('names the missing permissions (AC-33) and why a file can’t be read', async () => {
    expect(body(await upload(fakeApi(missing), { file: csv() }))).toEqual({
      kind: 'perms',
      missing: ['org:manage-employee-records', 'projects:manage-projects'],
    });
    const unreadable = fakeApi(() =>
      apiError(
        'ValidationError',
        'platform.validation_failed',
        'The header row lacks the columns Hours',
        400,
        { issues: [{ path: 'file', message: 'The header row lacks the columns Hours' }] },
      ),
    );
    expect(body(await upload(unreadable, { file: csv() }))).toEqual({
      kind: 'invalid',
      message: 'The header row lacks the columns Hours',
    });
  });

  it('asks for a file before calling the api', async () => {
    const api = fakeApi(() => json(RUN, 201));
    const result = await upload(api, {});
    expect(status(result)).toBe(400);
    expect(body(result)).toEqual({ kind: 'invalid', message: IMPORT_MESSAGE.noFile });
    expect(api.requests).toHaveLength(0);
  });
});
