import type { EmployeeRecord } from '@arv/contracts/org';
import { CircleCheckIcon, PlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { data } from 'react-router';
import type { ApiFailure } from '~/shared/lib/api.server';
import { foreignOriginResponse, isAllowedOrigin } from '~/shared/lib/origin-check.server';
import { refusalResponse } from '~/shared/lib/refusal.server';
import { getSessionToken } from '~/shared/lib/session.server';
import { Alert } from '~/shared/ui/alert';
import { Button } from '~/shared/ui/button';
import { EmployeeRecordDialog } from '../components/employee-record-dialog';
import { EmployeeRecordList } from '../components/employee-record-list';
import { dateText, type EmployeeRecordActionResult } from '../employee-record';
import { readRecordForm, recordFailure } from '../employee-record-action.server';
import { orgGateway } from '../org.server';
import type { Route } from './+types/employee-records';

export const meta: Route.MetaFunction = () => [{ title: 'People · ARV Intranet' }];

/** 403 → «you lack the permission to manage employee records», showing nothing (AC-22). */
async function loadFailure(failed: ApiFailure, request: Request) {
  return (
    (await refusalResponse(failed, request)) ??
    data('Could not load the employee records', { status: 502 })
  );
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const gateway = orgGateway(context.cloudflare.env.API, await getSessionToken(request));
  const [records, teams, logins] = await Promise.all([
    gateway.listEmployeeRecords(),
    gateway.listTeams(),
    gateway.listLogins(),
  ]);
  if (!records.ok) throw await loadFailure(records, request);
  if (!teams.ok) throw await loadFailure(teams, request);
  // The access list is identity's; without manage-access the login can't be chosen here.
  return { records: records.value, teams: teams.value, logins: logins.ok ? logins.value : null };
}

/** Create or edit, told apart by `intent`; rule refusals come back to the dialog (AC-20, AC-19b, AC-19c). */
export async function action({ request, context }: Route.ActionArgs) {
  if (!isAllowedOrigin(request)) throw foreignOriginResponse();
  const form = await request.formData();
  const read = readRecordForm(form);
  if (!read.ok) {
    return data<EmployeeRecordActionResult>(
      { ok: false, kind: 'invalid', fieldErrors: read.fieldErrors },
      { status: 400 },
    );
  }
  const gateway = orgGateway(context.cloudflare.env.API, await getSessionToken(request));
  const { input } = read;

  const result = await (() => {
    switch (form.get('intent')) {
      case 'create':
        return gateway.createEmployeeRecord({
          ...input,
          ...(input.userId === undefined ? {} : { userId: input.userId }),
        });
      case 'update':
        return gateway.updateEmployeeRecord(String(form.get('employeeRecordId') ?? ''), {
          ...input,
          version: Number(form.get('version')),
          ...(form.get('confirm') === 'true' ? { confirm: true } : {}),
        });
      default:
        return null;
    }
  })();

  if (result === null) {
    return data<EmployeeRecordActionResult>(
      { ok: false, kind: 'error', error: 'Unknown action' },
      { status: 400 },
    );
  }
  if (result.ok) {
    return {
      ok: true,
      id: result.value.id,
      fullName: result.value.fullName,
      employmentEnd: result.value.employmentEnd,
    } satisfies EmployeeRecordActionResult;
  }
  const refused = await refusalResponse(result, request);
  if (refused) throw refused;
  return data<EmployeeRecordActionResult>(recordFailure(result), { status: result.status });
}

type Saved = Extract<EmployeeRecordActionResult, { ok: true }>;

export default function EmployeeRecords({ loaderData }: Route.ComponentProps) {
  const { records, teams, logins } = loaderData;
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EmployeeRecord | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">People</h1>
      {saved ? <SavedNotice saved={saved} onDismiss={() => setSaved(null)} /> : null}
      <EmployeeRecordList
        records={records}
        logins={logins}
        highlightId={saved?.id}
        onEdit={setEditing}
        action={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon aria-hidden="true" />
            New employee record
          </Button>
        }
      />
      <EmployeeRecordDialog
        teams={teams}
        logins={logins}
        open={creating}
        onOpenChange={setCreating}
        onSaved={setSaved}
      />
      {editing ? (
        <EmployeeRecordDialog
          key={editing.id}
          record={editing}
          teams={teams}
          logins={logins}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onSaved={setSaved}
        />
      ) : null}
    </main>
  );
}

/**
 * «Employee record saved». With an end date, allocations past it are kept and the board marks
 * them as needing attention (AC-21).
 */
function SavedNotice({ saved, onDismiss }: { saved: Saved; onDismiss: () => void }) {
  return (
    <Alert role="status" className="pr-12">
      <CircleCheckIcon aria-hidden="true" />
      <div className="flex flex-col gap-0.5">
        <p className="font-medium">Employee record saved</p>
        <p className="text-muted-foreground">
          {saved.employmentEnd
            ? `${saved.fullName}'s allocations after ${dateText(saved.employmentEnd)} are kept and marked as needing attention on the board.`
            : `${saved.fullName} is up to date on the board.`}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss"
        className="absolute top-2 right-2"
        onClick={onDismiss}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </Alert>
  );
}
