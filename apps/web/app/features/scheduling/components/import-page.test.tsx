import { File as NodeFile } from 'node:buffer';
import type { ImportResult } from '@arv/contracts/scheduling';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoutesStub } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ImportActionResult, ImportPageData } from '../import';
import { ImportPage } from './import-page';

afterEach(cleanup);

// The page sends the file through `fetcher.submit`, which builds a real `Request`. Node's
// `Request` accepts only Node's own `File` and `FormData` (as the Worker runtime has), not jsdom's,
// so this file swaps them in while it runs.
const jsdom = { File: globalThis.File, FormData: globalThis.FormData };
beforeAll(async () => {
  const nodeForm = await new Response(new URLSearchParams('a=1')).formData();
  globalThis.File = NodeFile as unknown as typeof File;
  globalThis.FormData = nodeForm.constructor as typeof FormData;
});
afterAll(() => {
  globalThis.File = jsdom.File;
  globalThis.FormData = jsdom.FormData;
});

const RUN: ImportResult = {
  id: '01933b8e-0000-7000-8000-000000000901',
  importedBy: { id: '01933b8e-0000-7000-8000-000000000202', name: 'Andrii Melnyk' },
  employeeRecordsCreated: 42,
  projectsCreated: 12,
  allocationsCreated: 168,
  createdAt: new Date('2026-12-02T10:00:00.000Z'),
};

const OPEN: ImportPageData = { kind: 'status', status: { completed: false, run: null } };

const PREVIEW: ImportActionResult = {
  kind: 'preview',
  preview: {
    employeeRecordsToCreate: 42,
    projectsToCreate: 12,
    allocationsToCreate: 168,
    incompleteRecords: 3,
    overbookedWeeks: [{ fullName: 'Olena Kovalenko', weekStart: '2026-12-07', overMinutes: 240 }],
  },
};

const CSV = 'Employee,Project\nOlena Kovalenko,Atlas CRM\n';

/** Renders the page on /import, its action answering `answers` in turn. */
function renderPage(data: ImportPageData, answers: ImportActionResult[] = []) {
  const forms: FormData[] = [];
  const Stub = createRoutesStub([
    {
      path: '/import',
      Component: () => <ImportPage data={data} />,
      action: async ({ request }) => {
        forms.push(await request.formData());
        return answers[Math.min(forms.length, answers.length) - 1] ?? null;
      },
    },
  ]);
  render(<Stub initialEntries={['/import']} />);
  return { forms };
}

async function chooseAndPreview(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(
    await screen.findByLabelText('Planning spreadsheet'),
    new File([CSV], 'planning-2026.csv', { type: 'text/csv' }),
  );
  expect(screen.getByText('planning-2026.csv')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Preview' }));
}

describe('ImportPage', () => {
  it('previews the file, then «Import everything» sends the same file with confirm (AC-30)', async () => {
    const { forms } = renderPage(OPEN, [PREVIEW, { kind: 'success', run: RUN }]);
    const user = userEvent.setup();
    expect((await screen.findByRole('button', { name: 'Preview' })).hasAttribute('disabled')).toBe(
      true,
    );
    await chooseAndPreview(user);

    const created = await screen.findByRole('region', { name: 'What the import will create' });
    expect(
      within(created).getByText('Employee records to create').previousSibling?.textContent,
    ).toBe('42');
    expect(within(created).getByText('Still incomplete after import')).toBeTruthy();
    expect(screen.getByText('Olena Kovalenko')).toBeTruthy();
    expect(screen.getByText('+4h')).toBeTruthy();
    expect(forms[0]!.has('confirm')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Import everything' }));
    expect(
      await screen.findByText(/Created 42 employee records, 12 projects and 168 allocations\./),
    ).toBeTruthy();
    expect(forms[1]!.get('confirm')).toBe('true');
    const [first, second] = [forms[0]!.get('file') as File, forms[1]!.get('file') as File];
    expect(second.name).toBe('planning-2026.csv');
    expect(await second.text()).toBe(await first.text());
  });

  it('lists the problem rows and nothing was imported (AC-31)', async () => {
    renderPage(OPEN, [
      {
        kind: 'problems',
        rows: [
          { row: 8, reason: 'empty_hours', message: 'Hours are empty' },
          {
            row: 27,
            reason: 'similar_name',
            message: 'Looks like the same person as row 12: “O. Kovalenko” / “Olena Kovalenko”',
          },
        ],
      },
    ]);
    const user = userEvent.setup();
    await chooseAndPreview(user);

    const table = await screen.findByRole('table', { name: 'Problem rows' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]?.textContent)).toEqual(['8', '27']);
    expect(within(rows[0]!).getByText('Empty hours')).toBeTruthy();
    expect(within(rows[1]!).getByText(/same person as row 12/)).toBeTruthy();
    expect(screen.getByText('Nothing was imported.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Fix the spreadsheet and upload again' }));
    expect(await screen.findByText('Drop the planning spreadsheet here')).toBeTruthy();
    expect(screen.queryByText('planning-2026.csv')).toBeNull();
  });

  it('shows why a file can’t be read, on the upload', async () => {
    renderPage(OPEN, [{ kind: 'invalid', message: 'The header row lacks the columns Hours' }]);
    const user = userEvent.setup();
    await chooseAndPreview(user);
    expect(await screen.findByText('The header row lacks the columns Hours')).toBeTruthy();
    expect(screen.getByText('Drop the planning spreadsheet here')).toBeTruthy();
  });

  it('shows the run summary once the import has run, not the upload (AC-32)', async () => {
    renderPage({ kind: 'status', status: { completed: true, run: RUN } });
    expect(
      await screen.findByText('The import was completed on 2 Dec 2026 by Andrii.'),
    ).toBeTruthy();
    const created = screen.getByRole('region', { name: 'Created by the import' });
    expect(within(created).getByText('Allocations created').previousSibling?.textContent).toBe(
      '168',
    );
    expect(screen.queryByLabelText('Planning spreadsheet')).toBeNull();
    expect(screen.getByRole('link', { name: 'Open the board' }).getAttribute('href')).toBe(
      '/schedule',
    );
  });

  it('says the import ran already when an upload finds it done (AC-32)', async () => {
    renderPage(OPEN, [{ kind: 'completed', completedAt: RUN.createdAt }]);
    const user = userEvent.setup();
    await chooseAndPreview(user);
    expect(await screen.findByText('The import was completed on 2 Dec 2026.')).toBeTruthy();
  });

  it('names every missing permission (AC-33)', async () => {
    renderPage({
      kind: 'perms',
      missing: ['org:manage-employee-records', 'projects:manage-projects'],
    });
    expect(
      await screen.findByText(
        'You need these permissions to import: manage employee records, manage projects.',
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Planning spreadsheet')).toBeNull();
  });

  it('refuses a file over 5 MB before sending it', async () => {
    const { forms } = renderPage(OPEN);
    const user = userEvent.setup();
    const big = new File([CSV], 'huge.csv', { type: 'text/csv' });
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    await user.upload(await screen.findByLabelText('Planning spreadsheet'), big);
    expect(screen.getByText('The file is larger than 5 MB.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Preview' }).hasAttribute('disabled')).toBe(true);
    await waitFor(() => expect(forms).toHaveLength(0));
  });
});
