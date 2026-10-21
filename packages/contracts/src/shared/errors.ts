import { Schema } from 'effect';

export class NotFound extends Schema.TaggedError<NotFound>()('NotFound', {
  resource: Schema.String,
  id: Schema.String,
}) {
  override get message() {
    return `${this.resource} ${this.id} not found`;
  }
}

export class Conflict extends Schema.TaggedError<Conflict>()('Conflict', {
  message: Schema.String,
}) {}

/** Body of every non-2xx JSON response from the API. */
export const ApiErrorBody = Schema.Struct({
  error: Schema.Struct({
    _tag: Schema.String,
    message: Schema.String,
  }),
});
export type ApiErrorBody = typeof ApiErrorBody.Type;
