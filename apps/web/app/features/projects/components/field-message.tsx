import { CircleAlertIcon } from 'lucide-react';

/** The error under a field, else its hint. */
export function FieldMessage({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error) {
    return (
      <p
        id={id}
        role="alert"
        className="flex items-start gap-1.5 text-xs font-medium text-destructive"
      >
        <CircleAlertIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
        {error}
      </p>
    );
  }
  if (!hint) return null;
  return (
    <p id={id} className="text-xs text-muted-foreground">
      {hint}
    </p>
  );
}
