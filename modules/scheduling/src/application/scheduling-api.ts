import { Context, Layer } from 'effect';

/** Facade for other modules. Add a method only when another module needs it. */
export class SchedulingApi extends Context.Tag('scheduling/SchedulingApi')<
  SchedulingApi,
  Record<never, never>
>() {}

export const SchedulingApiLive = Layer.succeed(SchedulingApi, {});
