import { SignInCompletion } from '@arv/contracts/identity';
import { type HttpEnv, runEffect, runEffectNoContent, validate } from '@arv/platform/http';
import { Effect } from 'effect';
import { Hono } from 'hono';
import { beginSignIn } from '../application/begin-sign-in';
import { completeSignIn } from '../application/complete-sign-in';
import { getMe, requireSignedIn } from '../application/get-me';
import { signOut } from '../application/sign-out';
import { presentMe, presentSession, presentSignInStart, toSignInContractError } from './presenter';

const BEARER = 'Bearer ';

/** Sign-in (both public), `me` and sign-out (openapi.yaml `sign-in` tag; ADR-0007). */
export const signInRoutes = new Hono<HttpEnv>()
  .post('/identity/sign-in/begin', (c) =>
    runEffect(c, beginSignIn().pipe(Effect.map(presentSignInStart))),
  )
  .post('/identity/sign-in/complete', validate('json', SignInCompletion), (c) => {
    const { code, codeVerifier } = c.req.valid('json');
    return runEffect(
      c,
      completeSignIn(code, codeVerifier).pipe(
        Effect.map(presentSession),
        Effect.mapError(toSignInContractError),
      ),
    );
  })
  .get('/identity/me', (c) => runEffect(c, getMe.pipe(Effect.map(presentMe))))
  .post('/identity/sign-out', (c) => {
    // A signed-in actor implies the host resolved it from this Bearer token.
    const token = c.req.header('authorization')?.slice(BEARER.length) ?? '';
    return runEffectNoContent(c, Effect.zipRight(requireSignedIn, signOut(token)));
  });
