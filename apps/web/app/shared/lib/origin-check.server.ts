const SAFE_METHODS = new Set(['GET', 'HEAD']);

/**
 * CSRF check (sad §8): a request that can change state must come from web's own origin. A missing
 * or `null` Origin is refused too: browsers send Origin on every non-GET request.
 */
export function isAllowedOrigin(request: Request): boolean {
  if (SAFE_METHODS.has(request.method)) return true;
  return request.headers.get('Origin') === new URL(request.url).origin;
}

/** The 403 for a request `isAllowedOrigin` refuses. */
export const foreignOriginResponse = () =>
  new Response('Cross-origin request refused', { status: 403 });
