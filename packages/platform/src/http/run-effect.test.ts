import { Conflict } from '@arv/contracts/shared';
import { Permission, PermissionDenied, Unauthenticated } from '@arv/kernel';
import { Effect, Layer, Schema } from 'effect';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AccessError, ContractError } from './errors';
import { type HttpEnv, runEffect } from './run-effect';

/** A one-route app that answers with `effect` run through `runEffect`. */
const answer = (effect: Effect.Effect<unknown, ContractError | AccessError>) => {
  const app = new Hono<HttpEnv>();
  app.use(async (c, next) => {
    c.set('appLayer', Layer.empty);
    await next();
  });
  app.get('/', (c) => runEffect(c, effect));
  return app.request('/');
};

const manageAccess = Schema.decodeSync(Permission)('identity:manage-access');

describe('runEffect', () => {
  it('answers 403 Forbidden for a kernel PermissionDenied', async () => {
    const res = await answer(Effect.fail(new PermissionDenied({ permission: manageAccess })));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: {
        _tag: 'Forbidden',
        code: 'identity.missing_permission',
        message: 'You lack the permission identity:manage-access',
        details: { missingPermissions: ['identity:manage-access'] },
      },
    });
  });

  it("answers 401 with the reason for a kernel Unauthenticated { reason: 'access-removed' }", async () => {
    const res = await answer(Effect.fail(new Unauthenticated({ reason: 'access-removed' })));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: {
        _tag: 'Unauthenticated',
        code: 'identity.access_removed',
        message: 'You no longer have access to the intranet',
      },
    });
  });

  it('answers 401 platform.unauthenticated for an anonymous actor', async () => {
    const res = await answer(Effect.fail(new Unauthenticated({})));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'platform.unauthenticated' } });
  });

  it('still maps contract errors (Conflict → 409)', async () => {
    const res = await answer(
      Effect.fail(new Conflict({ message: 'taken', code: 'identity.email_taken' })),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { _tag: 'Conflict', message: 'taken' } });
  });

  it('answers 500 platform.internal_error for a defect', async () => {
    const res = await answer(Effect.die(new Error('db down')));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: {
        _tag: 'InternalError',
        code: 'platform.internal_error',
        message: 'Internal server error',
      },
    });
  });

  it('answers the success value with the given status', async () => {
    const res = await answer(Effect.succeed({ ok: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
