import type { AdminContact } from '@arv/contracts/identity';
import { CircleCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '~/shared/ui/button';

/** Full-height, centred column with the brand above one card (design 1–3). */
export function PublicScreen({ titleId, children }: { titleId: string; children: ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-12 text-sm">
      <p className="text-xl font-semibold">ARV Intranet</p>
      <section
        aria-labelledby={titleId}
        className="flex w-full max-w-[400px] flex-col gap-6 rounded-lg border border-border bg-card p-6 text-card-foreground"
      >
        {children}
      </section>
    </main>
  );
}

export function CardHead({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h1 id={id} className="text-xl font-semibold">
        {title}
      </h1>
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}

/**
 * Posts to the sign-in action, which begins sign-in and redirects to Google. A plain document
 * form: the redirect leaves the app, so client-side navigation has nothing to do.
 */
export function SignInForm({
  returnTo,
  label = 'Sign in with Google',
}: {
  returnTo: string;
  label?: string;
}) {
  return (
    <form method="post" action="/sign-in">
      <input type="hidden" name="returnTo" value={returnTo} />
      <Button type="submit" className="w-full px-4">
        {label}
      </Button>
    </form>
  );
}

export function SignedOutNote() {
  return (
    <p role="status" className="flex items-center gap-2 text-muted-foreground">
      <CircleCheck aria-hidden="true" className="size-4" />
      You signed out.
    </p>
  );
}

/** AC-02: not a verified, company-managed Google account. */
export function RefusedScreen() {
  return (
    <PublicScreen titleId="refused-title">
      <CardHead id="refused-title" title="Can't sign in with this account">
        Only verified company Google accounts can sign in.
      </CardHead>
      <SignInForm returnTo="/" label="Try another account" />
    </PublicScreen>
  );
}

/** AC-03: a company account not on the access list; lists the admins, or says to ask a manager. */
export function NotSetUpScreen({ admins }: { admins: ReadonlyArray<AdminContact> }) {
  return (
    <PublicScreen titleId="not-set-up-title">
      <CardHead id="not-set-up-title" title="Not set up yet">
        {admins.length > 0
          ? "You're not on the intranet's access list yet. Ask one of these admins to add you."
          : "You're not on the intranet's access list yet. Ask your manager."}
      </CardHead>
      {admins.length > 0 ? (
        <ul className="flex flex-col border-t border-border">
          {admins.map((admin) => (
            <li key={admin.email} className="flex flex-col border-b border-border py-3">
              <span className="font-medium">{admin.name}</span>
              <a
                href={`mailto:${admin.email}`}
                className="underline decoration-ring underline-offset-4 hover:decoration-foreground"
              >
                {admin.email}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </PublicScreen>
  );
}

/** Google's return could not be completed: state mismatch, expired round-trip, cancel or api failure. */
export function SignInProblemScreen({ message }: { message: string }) {
  return (
    <PublicScreen titleId="sign-in-problem-title">
      <CardHead id="sign-in-problem-title" title="Sign-in didn't finish">
        {message}
      </CardHead>
      <SignInForm returnTo="/" />
    </PublicScreen>
  );
}
