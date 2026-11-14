import { data } from 'react-router';

/**
 * Catch-all for unknown paths. Matching them (instead of the router's own 404) runs the root gate
 * first, so an anonymous visitor to a page that doesn't exist yet still goes to sign-in (ADR-0002).
 */
export function loader() {
  throw data('Not Found', { status: 404 });
}

export default function NotFound() {
  return null;
}
