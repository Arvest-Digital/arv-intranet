import { CircleAlertIcon, UploadIcon, XIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useFetcher } from 'react-router';
import { cn } from '~/shared/lib/utils';
import { Alert } from '~/shared/ui/alert';
import { Button } from '~/shared/ui/button';
import { IMPORT_MESSAGE, type ImportActionResult, type ImportPageData } from '../import';
import {
  FileRow,
  ImportCompleted,
  ImportPermissionsMissing,
  ImportPreviewView,
  ImportProblems,
  ImportSuccess,
} from './import-results';

/** Where the page posts the file: its own route's action. */
export const IMPORT_ACTION = '/import';

/**
 * The one-time import (US-11, flow 13): upload the planning spreadsheet → the preview, or the
 * problem rows → «Import everything» uploads the same file again with `confirm` (AC-30, AC-31,
 * sad §8). Once the import has run the page shows what it created instead (AC-32); without all
 * three permissions it names the ones missing (AC-33). The file stays in the browser between the
 * check and the confirm; nothing is saved until then.
 */
export function ImportPage({ data }: { data: ImportPageData }) {
  const fetcher = useFetcher<ImportActionResult>();
  const [file, setFile] = useState<File | null>(null);
  // Which upload the shown answer belongs to: «Choose another file» puts the upload back.
  const [checked, setChecked] = useState(false);
  const submitting = fetcher.state !== 'idle';
  const result = checked && fetcher.state === 'idle' ? fetcher.data : undefined;

  const send = (confirm: boolean) => {
    if (!file) return;
    const form = new FormData();
    form.set('file', file);
    if (confirm) form.set('confirm', 'true');
    setChecked(true);
    fetcher.submit(form, {
      method: 'post',
      action: IMPORT_ACTION,
      encType: 'multipart/form-data',
    });
  };
  const restart = () => {
    setChecked(false);
    setFile(null);
  };

  const body = (() => {
    if (data.kind === 'perms') return <ImportPermissionsMissing missing={data.missing} />;
    if (result?.kind === 'perms') return <ImportPermissionsMissing missing={result.missing} />;
    if (result?.kind === 'success') return <ImportSuccess run={result.run} />;
    if (data.status.completed || result?.kind === 'completed') {
      return (
        <ImportCompleted
          run={data.status.run}
          completedAt={result?.kind === 'completed' ? result.completedAt : null}
        />
      );
    }
    if (file && result?.kind === 'preview') {
      return (
        <ImportPreviewView
          file={file}
          preview={result.preview}
          submitting={submitting}
          onConfirm={() => send(true)}
          onChooseAnother={restart}
        />
      );
    }
    if (file && result?.kind === 'problems') {
      return <ImportProblems file={file} rows={result.rows} onUploadAgain={restart} />;
    }
    return (
      <ImportUpload
        file={file}
        error={result?.kind === 'invalid' || result?.kind === 'error' ? result.message : null}
        submitting={submitting}
        onFile={(next) => {
          setChecked(false);
          setFile(next);
        }}
        onPreview={() => send(false)}
      />
    );
  })();

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Import from the planning spreadsheet</h1>
      {body}
    </main>
  );
}

/** Step one: choose the file, by dropping it or from the picker, then preview. */
function ImportUpload({
  file,
  error,
  submitting,
  onFile,
  onPreview,
}: {
  file: File | null;
  error: string | null;
  submitting: boolean;
  onFile: (file: File | null) => void;
  onPreview: () => void;
}) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const tooLarge = file !== null && file.size > IMPORT_MESSAGE.maxBytes;
  const message = tooLarge ? IMPORT_MESSAGE.tooLarge : error;

  return (
    <div className="flex max-w-[720px] flex-col">
      <p>
        The import runs once. It seeds the board from the planning spreadsheet: employee records,
        teams, projects and allocations. After it’s done, all changes are made on the board.
      </p>
      <ol className="mt-3 list-decimal pl-5 leading-[22px]">
        <li>Upload the spreadsheet and preview what will be created.</li>
        <li>Fix any problem rows and upload again if needed.</li>
        <li>Confirm to import everything in one step.</li>
      </ol>
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const dropped = event.dataTransfer.files[0];
          if (dropped) onFile(dropped);
        }}
        className={cn(
          'mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-[1.5px] border-dashed border-ring bg-muted/50 px-4 py-8 text-center transition-colors duration-150 ease-out hover:bg-accent focus-within:ring-3 focus-within:ring-ring/30',
          dragging && 'bg-accent',
        )}
      >
        <span
          aria-hidden="true"
          className="grid size-10 place-items-center rounded-full border border-border bg-background text-muted-foreground"
        >
          <UploadIcon className="size-5" />
        </span>
        <span className="font-medium">Drop the planning spreadsheet here</span>
        <span className="text-[13px] text-muted-foreground">
          or <span className="text-foreground underline underline-offset-3">choose a file</span> ·
          CSV, up to 5 MB
        </span>
        <input
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          aria-label="Planning spreadsheet"
          className="sr-only"
          onChange={(event) => {
            onFile(event.target.files?.[0] ?? null);
            event.target.value = '';
          }}
        />
      </label>
      {file ? (
        <FileRow file={file}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remove file"
            onClick={() => onFile(null)}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </FileRow>
      ) : null}
      {message ? (
        <Alert variant="destructive" className="mt-3">
          <CircleAlertIcon aria-hidden="true" />
          <p>{message}</p>
        </Alert>
      ) : null}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button disabled={!file || tooLarge || submitting} onClick={onPreview}>
          {submitting ? 'Checking…' : 'Preview'}
        </Button>
        <span className="text-xs text-muted-foreground">Nothing is saved until you confirm.</span>
      </div>
    </div>
  );
}
