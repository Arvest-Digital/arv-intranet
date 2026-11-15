/**
 * Walks an error's `cause` chain (DbError → DrizzleQueryError → pg error) for a violation of the
 * named unique index. Adapters check for a clash before writing, because a failed statement
 * aborts the enclosing transaction and makes node-postgres drop the socket; the index is only
 * the backstop for a concurrent write.
 */
export const isUniqueViolation = (error: unknown, constraint: string): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (candidate.code === '23505' && candidate.constraint === constraint) return true;
    current = candidate.cause;
  }
  return false;
};
