import { data, redirect } from 'react-router';
import { commitSession, destroySignInState, getSignInState } from '~/shared/lib/session.server';
import {
  NotSetUpScreen,
  PUBLIC_SCREEN,
  RefusedScreen,
  SignInProblemScreen,
} from '../components/public-screens';
import { identityGateway } from '../identity.server';
import type { Route } from './+types/sign-in-return';

export const handle = PUBLIC_SCREEN;

export const meta: Route.MetaFunction = () => [{ title: 'Sign in · ARV Intranet' }];

const NOT_FINISHED = 'The sign-in link expired or was already used. Try again.';
const FAILED = 'Something went wrong. Try again.';

/**
 * Google's return (sad §6 Critical flow 1): check `state` against the state cookie, complete in
 * the api, then set the session cookie and go to the kept `returnTo`. Every outcome clears the
 * state cookie, so a return can be used once.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const startedAt = Date.now();
  const headers = new Headers({ 'Set-Cookie': await destroySignInState() });
  const url = new URL(request.url);
  const pending = await getSignInState(request);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');

  if (!pending || !state || state !== pending.state || !code) {
    return data({ screen: 'problem', message: NOT_FINISHED } as const, { status: 400, headers });
  }

  const outcome = await identityGateway(context.cloudflare.env.API, null).completeSignIn({
    code,
    codeVerifier: pending.codeVerifier,
  });

  switch (outcome.kind) {
    case 'signed-in':
      headers.append('Set-Cookie', await commitSession(outcome.session));
      console.info({ signInCompleteMs: Date.now() - startedAt });
      return redirect(pending.returnTo, { headers });
    case 'refused':
      return data({ screen: 'refused' } as const, { status: 403, headers });
    case 'not-set-up':
      return data({ screen: 'not-set-up', admins: outcome.admins } as const, {
        status: 403,
        headers,
      });
    case 'failed':
      return data({ screen: 'problem', message: FAILED } as const, { status: 502, headers });
  }
}

export default function SignInReturn({ loaderData }: Route.ComponentProps) {
  switch (loaderData.screen) {
    case 'refused':
      return <RefusedScreen />;
    case 'not-set-up':
      return <NotSetUpScreen admins={loaderData.admins} />;
    case 'problem':
      return <SignInProblemScreen message={loaderData.message} />;
  }
}
