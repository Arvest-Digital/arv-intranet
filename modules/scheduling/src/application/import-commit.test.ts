import { type Actor, PermissionDenied } from '@arv/kernel';
import { MANAGE_EMPLOYEE_RECORDS } from '@arv/org';
import { MANAGE_PROJECTS } from '@arv/projects';
import { Cause, Effect, Exit, Layer, Option } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ImportAlreadyCompleted,
  ImportConfirmationRequired,
  ImportFileInvalid,
  ImportPermissionsMissing,
} from '../domain/errors';
import { EDIT_ALLOCATIONS, VIEW_WHOLE_BOARD } from '../permissions';
import { getImportStatus, importSpreadsheet, MAX_IMPORT_BYTES } from './import-commit';
import { makeSchedulingFakes, type SchedulingFakes } from './testing';

const HEADER =
  'Employee,Team,Contract hours,Working days,Employment start,Employment end,Project,Project type,Start,End,Hours,Per';
const line = (...cells: string[]) => cells.join(',');
const csv = (...rows: string[]) => [HEADER, ...rows].join('\n');

const CLEAN = csv(
  line(
    'Ada Lovelace',
    'Platform',
    '40',
    'Mon-Fri',
    '2025-01-06',
    '',
    'Atlas',
    'client',
    '2026-09-07',
    '2026-11-27',
    '24',
    'week',
  ),
  line(
    'Ada Lovelace',
    'Platform',
    '40',
    'Mon-Fri',
    '2025-01-06',
    '',
    'Orion',
    '',
    '2026-11-02',
    '2026-11-27',
    '24',
    'week',
  ),
  line(
    'Grace Hopper',
    'platform ',
    '',
    '',
    '',
    '',
    'Atlas',
    '',
    '2026-11-02',
    '2026-11-27',
    '4',
    'day',
  ),
  line(
    'Alan Turing',
    '',
    '32',
    'Mon-Thu',
    '2024-03-01',
    '',
    'Annual leave',
    'leave',
    '2026-12-21',
    '2026-12-24',
    '',
    '',
  ),
);

/** An uploaded file whose reads are counted, to prove refusals happen before reading. */
const upload = (text: string) => {
  const file = {
    reads: 0,
    size: new TextEncoder().encode(text).length,
    text: async () => {
      file.reads += 1;
      return text;
    },
  };
  return file;
};

let fakes: SchedulingFakes;
let importer: Actor;

const run = <A, E, R>(effect: Effect.Effect<A, E, R>, actor: Actor = importer) =>
  Effect.runPromiseExit(
    effect.pipe(Effect.provide(Layer.merge(fakes.layer, fakes.as(actor)))) as Effect.Effect<
      A,
      E,
      never
    >,
  );

const failed = async <A, E>(promise: Promise<Exit.Exit<A, E>>): Promise<E> => {
  const exit = await promise;
  if (Exit.isSuccess(exit))
    throw new Error(`expected a failure, got ${JSON.stringify(exit.value)}`);
  const error = Cause.failureOption(exit.cause);
  if (Option.isNone(error))
    throw new Error(`expected a typed failure, got: ${Cause.pretty(exit.cause)}`);
  return error.value;
};

const succeeded = async <A, E>(promise: Promise<Exit.Exit<A, E>>): Promise<A> => {
  const exit = await promise;
  if (Exit.isFailure(exit)) throw new Error(`expected success, got ${exit.cause}`);
  return exit.value;
};

beforeEach(() => {
  fakes = makeSchedulingFakes();
  importer = fakes.user([EDIT_ALLOCATIONS, MANAGE_EMPLOYEE_RECORDS, MANAGE_PROJECTS]);
});

describe('importSpreadsheet — refusals', () => {
  it('names every missing permission without reading the file (AC-33)', async () => {
    const file = upload(CLEAN);
    const error = await failed(
      run(importSpreadsheet({ file, confirm: true }), fakes.user([EDIT_ALLOCATIONS])),
    );
    expect(error).toEqual(
      new ImportPermissionsMissing({ missing: [MANAGE_EMPLOYEE_RECORDS, MANAGE_PROJECTS] }),
    );
    expect(file.reads).toBe(0);
  });

  it('refuses a second import once the first completed, without reading the file (AC-32)', async () => {
    const earlier = fakes.seedImportRun(
      importer._tag === 'User' ? importer.id : (undefined as never),
      new Date('2026-10-01T09:00:00Z'),
    );
    const file = upload(CLEAN);
    expect(await failed(run(importSpreadsheet({ file, confirm: false })))).toEqual(
      new ImportAlreadyCompleted({ completedAt: earlier.createdAt }),
    );
    expect(file.reads).toBe(0);
  });

  it('refuses a file over the size limit without reading it', async () => {
    const file = { ...upload(CLEAN), size: MAX_IMPORT_BYTES + 1 };
    expect(await failed(run(importSpreadsheet({ file, confirm: false })))).toBeInstanceOf(
      ImportFileInvalid,
    );
  });
});

describe('importSpreadsheet — preview, then confirm (AC-30, ADR-0010)', () => {
  it('answers an unconfirmed upload with the preview and creates nothing', async () => {
    const error = await failed(run(importSpreadsheet({ file: upload(CLEAN), confirm: false })));
    expect(error).toBeInstanceOf(ImportConfirmationRequired);
    expect(error).toMatchObject({
      employeeRecordsToCreate: 3,
      projectsToCreate: 3,
      allocationsToCreate: 4,
      incompleteRecords: 1,
    });
    expect(fakes.resources()).toEqual([]);
    expect(fakes.allocations()).toEqual([]);
    expect(fakes.importRun()).toBeNull();
  });

  it('a confirmed upload creates records, projects, allocations, imported history and the run', async () => {
    const orion = fakes.seedProject({ name: 'Orion', type: 'internal' });

    const completed = await succeeded(
      run(importSpreadsheet({ file: upload(CLEAN), confirm: true })),
    );

    const actorId = importer._tag === 'User' ? importer.id : undefined;
    expect(completed).toMatchObject({
      importedBy: actorId,
      employeeRecordsCreated: 3,
      projectsCreated: 2,
      allocationsCreated: 4,
    });
    expect(fakes.importRun()).toEqual(completed);

    const people = new Map(fakes.resources().map((r) => [r.fullName, r]));
    expect([...people.keys()]).toEqual(['Ada Lovelace', 'Grace Hopper', 'Alan Turing']);
    // «platform » matches the team «Platform» the first record created (AC-19d).
    expect(people.get('Grace Hopper')?.teamId).toBe(people.get('Ada Lovelace')?.teamId);

    const projects = new Map(fakes.projects().map((p) => [p.name, p]));
    expect([...projects.keys()].sort()).toEqual(['Annual leave', 'Atlas', 'Orion']);

    const booked = fakes
      .allocations()
      .map(({ allocation, lastChangedBy }) => [
        allocation.employeeId,
        allocation.projectId,
        allocation.version,
        lastChangedBy,
        allocation.segments.map((s) => [s.startsOn, s.endsOn, s.rateMinutes, s.ratePeriod]),
      ]);
    expect(booked).toEqual([
      [
        people.get('Ada Lovelace')?.employeeId,
        projects.get('Atlas')?.id,
        1,
        actorId,
        [['2026-09-07', '2026-11-27', 1440, 'week']],
      ],
      [
        people.get('Ada Lovelace')?.employeeId,
        orion.id,
        1,
        actorId,
        [['2026-11-02', '2026-11-27', 1440, 'week']],
      ],
      [
        people.get('Grace Hopper')?.employeeId,
        projects.get('Atlas')?.id,
        1,
        actorId,
        [['2026-11-02', '2026-11-27', 240, 'day']],
      ],
      [
        people.get('Alan Turing')?.employeeId,
        projects.get('Annual leave')?.id,
        1,
        actorId,
        [['2026-12-21', '2026-12-24', null, 'full-day']],
      ],
    ]);

    const history = fakes.history();
    expect(history).toHaveLength(4);
    expect(history.every((h) => h.entry.changeKind === 'imported' && h.changedBy === actorId)).toBe(
      true,
    );
    expect(history.map((h) => h.allocationId)).toEqual(
      fakes.allocations().map((a) => a.allocation.id),
    );
    expect(history[0]?.entry).toMatchObject({ effectiveFrom: null, before: null });
  });

  it('a failing row mid-commit leaves nothing behind', async () => {
    let inserted = 0;
    fakes.hooks.beforeInsertMany = () => {
      inserted += 1;
      if (inserted === 3) throw new Error('row 4 failed');
    };

    const exit = await run(importSpreadsheet({ file: upload(CLEAN), confirm: true }));

    expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true);
    expect(inserted).toBe(3);
    expect(fakes.resources()).toEqual([]);
    expect(fakes.projects()).toEqual([]);
    expect(fakes.allocations()).toEqual([]);
    expect(fakes.history()).toEqual([]);
    expect(fakes.importRun()).toBeNull();
  });

  it('confirming problem rows still refuses them: the preview is recomputed', async () => {
    const error = await failed(
      run(
        importSpreadsheet({
          file: upload(
            csv(
              line(
                'Ada Lovelace',
                '',
                '40',
                '',
                '2025-01-06',
                '',
                'Atlas',
                '',
                '2026-11-02',
                '2026-11-06',
                '',
                '',
              ),
            ),
          ),
          confirm: true,
        }),
      ),
    );
    expect(error).toMatchObject({ _tag: 'ImportProblemRows' });
    expect(fakes.importRun()).toBeNull();
  });
});

describe('getImportStatus (AC-32)', () => {
  it('is none before the import and the run after it', async () => {
    expect(await succeeded(run(getImportStatus))).toEqual(Option.none());
    const earlier = fakes.seedImportRun(
      importer._tag === 'User' ? importer.id : (undefined as never),
    );
    expect(await succeeded(run(getImportStatus))).toEqual(Option.some(earlier));
  });

  it('requires edit-allocations', async () => {
    expect(await failed(run(getImportStatus, fakes.user([VIEW_WHOLE_BOARD])))).toBeInstanceOf(
      PermissionDenied,
    );
  });
});
