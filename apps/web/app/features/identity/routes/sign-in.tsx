import { data, redirect } from 'react-router';
import { foreignOriginResponse, isAllowedOrigin } from '~/shared/lib/origin-check.server';
import { safeReturnTo } from '~/shared/lib/return-to';
import { commitSignInState } from '~/shared/lib/session.server';
import {
  CardHead,
  PUBLIC_SCREEN,
  PublicScreen,
  SignedOutNote,
  SignInForm,
} from '../components/public-screens';
import { identityGateway } from '../identity.server';
import type { Route } from './+types/sign-in';

export const handle = PUBLIC_SCREEN;

export const meta: Route.MetaFunction = () => [{ title: 'Sign in · ARV Intranet' }];

/**
 * Renders the button only. Never begins sign-in or redirects to Google on load, so a signed-out
 * user stays signed out even while their Google session lives on (sad §4 choice 1, AC-20).
 */
export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return {
    returnTo: safeReturnTo(url.searchParams.get('returnTo')),
    signedOut: url.searchParams.has('signedOut'),
  };
}

/** The button: begin, keep state + verifier + returnTo in the state cookie, go to Google. */
export async function action({ request, context }: Route.ActionArgs) {
  if (!isAllowedOrigin(request)) throw foreignOriginResponse();
  const form = await request.formData();
  const begun = await identityGateway(context.cloudflare.env.API, null).beginSignIn();
  if (!begun.ok) {
    return data({ error: 'Could not start sign-in. Try again.' }, { status: 502 });
  }
  const { authorizationUrl, state, codeVerifier } = begun.value;
  return redirect(authorizationUrl, {
    headers: {
      'Set-Cookie': await commitSignInState({
        state,
        codeVerifier,
        returnTo: safeReturnTo(form.get('returnTo')),
      }),
    },
  });
}

export default function SignIn({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <PublicScreen titleId="sign-in-title">
      <CardHead id="sign-in-title" title="Sign in to ARV Intranet">
        Use your company Google account.
      </CardHead>
      {loaderData.signedOut ? <SignedOutNote /> : null}
      {actionData?.error ? (
        <p role="alert" className="text-destructive">
          {actionData.error}
        </p>
      ) : null}
      <SignInForm returnTo={loaderData.returnTo} />
    </PublicScreen>
  );
}
