import type { ProjectType } from '@arv/contracts/projects';
import { CircleAlertIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useFetcher } from 'react-router';
import { Alert } from '~/shared/ui/alert';
import { Button } from '~/shared/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/shared/ui/dialog';
import { Input } from '~/shared/ui/input';
import { PROJECT_TYPES, type ProjectActionResult, TYPE_HELP } from '../project';
import { FieldMessage } from './field-message';

/**
 * «New project»: name and type (AC-23). A name an open project already uses is shown under the
 * name (AC-24). Mounted inside the dialog's popup, so a reopened dialog starts clean.
 */
export function ProjectCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (projectId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-[480px]">
        <ProjectCreateBody
          onDone={(projectId) => {
            onCreated?.(projectId);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function ProjectCreateBody({ onDone }: { onDone: (projectId: string) => void }) {
  const fetcher = useFetcher<ProjectActionResult>();
  const [type, setType] = useState<ProjectType>('client');
  const id = useId();

  const result = fetcher.state === 'idle' ? fetcher.data : undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once per answer, not per render
  useEffect(() => {
    if (result?.ok && result.intent === 'create') onDone(result.projectId);
  }, [result]);

  const failure = result && !result.ok ? result : null;
  const fieldErrors = failure?.kind === 'invalid' ? failure.fieldErrors : {};
  const alertError = failure?.kind === 'error' ? failure.error : null;
  const submitting = fetcher.state !== 'idle';

  const nameId = `${id}-name`;
  const typeId = `${id}-type`;

  return (
    <fetcher.Form method="post" className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>New project</DialogTitle>
        <DialogDescription>
          Projects are open for allocations until they are closed.
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="intent" value="create" />
      {alertError ? (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <p>{alertError}</p>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2">
        <label htmlFor={nameId} className="font-medium">
          Name
        </label>
        <Input
          id={nameId}
          name="name"
          required
          maxLength={200}
          aria-describedby={`${nameId}-message`}
          {...(fieldErrors.name ? { 'aria-invalid': true } : {})}
        />
        <FieldMessage
          id={`${nameId}-message`}
          error={fieldErrors.name}
          hint="Names are compared ignoring case and spaces."
        />
      </div>
      <fieldset className="flex flex-col gap-2" aria-describedby={`${typeId}-message`}>
        <legend className="mb-2 font-medium">Type</legend>
        <div className="flex flex-wrap gap-1.5">
          {PROJECT_TYPES.map(([value, label]) => (
            <label
              key={value}
              className="inline-flex h-8 cursor-pointer items-center rounded-md border border-input bg-input/50 px-3 text-[13px] font-medium transition-colors duration-150 ease-out hover:bg-accent has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/30"
            >
              <input
                type="radio"
                name="type"
                value={value}
                checked={type === value}
                onChange={() => setType(value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
        <FieldMessage id={`${typeId}-message`} error={fieldErrors.type} hint={TYPE_HELP[type]} />
      </fieldset>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create project'}
        </Button>
      </DialogFooter>
    </fetcher.Form>
  );
}
