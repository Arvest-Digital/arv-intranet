import { LockIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Button, buttonVariants } from '~/shared/ui/button';
import { CardHead, PublicScreen, SignInForm } from './public-screens';

/** AC-07: removed from the access list; the session cookie is already cleared. */
export function AccessRemovedScreen() {
  return (
    <PublicScreen titleId="access-removed-title">
      <CardHead id="access-removed-title" title="Access removed">
        You no longer have access to the intranet.
      </CardHead>
      <SignInForm returnTo="/" label="Sign in again" />
    </PublicScreen>
  );
}

/** AC-08: signed in, but without the permission the page needs. Shows nothing of the page. */
export function MissingPermissionNotice({ permission }: { permission?: string }) {
  if (!permission) {
    return (
      <main className="flex flex-col items-start gap-4 py-12">
        <h1 className="text-xl font-semibold">You don't have permission to manage access.</h1>
        <Link to="/" className={buttonVariants()}>
          Go to home
        </Link>
      </main>
    );
  }
  // A named permission (AC-28): the lock, which permission is missing, and who can grant it.
  return (
    <main className="grid min-h-[50vh] place-items-center py-12">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <span
          aria-hidden="true"
          className="grid size-10 place-items-center rounded-lg border border-border bg-muted text-muted-foreground"
        >
          <LockIcon className="size-5" />
        </span>
        <h1 className="text-base font-semibold">You don’t have the “{permission}” permission.</h1>
        <p className="text-muted-foreground">Ask an admin to grant it.</p>
        <Link to="/" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Go to home
        </Link>
      </div>
    </main>
  );
}

/** Signed in, and a page failed for another reason: one sentence and a retry. */
export function ErrorNotice() {
  return (
    <main role="alert" className="flex flex-col items-start gap-4 py-12">
      <h1 className="text-xl font-semibold">Something went wrong. Try again.</h1>
      <Button onClick={() => window.location.reload()}>Try again</Button>
    </main>
  );
}

/** The gate failed for a reason other than the session (api down, fail closed): no data shown. */
export function SignedOutErrorScreen() {
  return (
    <PublicScreen titleId="error-title">
      <CardHead id="error-title" title="Something went wrong">
        The intranet can't be reached right now. Try again in a moment.
      </CardHead>
    </PublicScreen>
  );
}
