import { ParseResult, Schema } from 'effect';
import type { ValidationTargets } from 'hono';
import { validator } from 'hono/validator';
import { errorBody } from './errors';

/** Hono validator backed by an Effect Schema. Failures return 400 with the standard error body. */
export const validate = <Target extends keyof ValidationTargets, A, I>(
  target: Target,
  schema: Schema.Schema<A, I>,
) =>
  validator(target, (value, c) => {
    const result = Schema.decodeUnknownEither(schema, { errors: 'all' })(value);
    if (result._tag === 'Left') {
      const message = ParseResult.TreeFormatter.formatErrorSync(result.left);
      const issues = ParseResult.ArrayFormatter.formatErrorSync(result.left).map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return c.json(
        errorBody('ValidationError', 'platform.validation_failed', message, { issues }),
        400,
      );
    }
    return result.right;
  });
