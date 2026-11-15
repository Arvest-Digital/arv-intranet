import { Context, Layer } from 'effect';

/** Facade for other modules. Add a method only when another module needs it. */
export class OrgApi extends Context.Tag('org/OrgApi')<OrgApi, Record<never, never>>() {}

export const OrgApiLive = Layer.succeed(OrgApi, {});
