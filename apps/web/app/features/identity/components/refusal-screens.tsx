import { CardHead, PublicScreen, SignInForm } from './public-screens';

/** AC-07: removed from the access list; the session cookie is already cleared. */
export function AccessRemovedScreen() {
  return (
    <PublicScreen titleId="access-removed-title">
      <CardHead id="access-removed-title" title="You no longer have access">
        An admin removed you from the intranet's access list. Ask an admin if you think this is a
        mistake.
      </CardHead>
      <SignInForm returnTo="/" label="Sign in again" />
    </PublicScreen>
  );
}

/** AC-08: signed in, but without the permission the page needs. Shows nothing of the page. */
export function MissingPermissionNotice() {
  return (
    <main className="flex flex-col gap-2 text-sm">
      <h1 className="text-xl font-semibold">No access to this page</h1>
      <p className="text-muted-foreground">You lack the permission to manage access.</p>
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
