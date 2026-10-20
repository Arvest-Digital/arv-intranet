import { Context, Layer } from 'effect';

/** Facade for other modules. Add a method only when another module needs it. */
export class SkeletonApi extends Context.Tag('skeleton/SkeletonApi')<
  SkeletonApi,
  Record<never, never>
>() {}

export const SkeletonApiLive = Layer.succeed(SkeletonApi, {});
