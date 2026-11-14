import type { Db } from '@arv/db';
import type { Actor } from '@arv/kernel';
import type { HttpEnv } from '@arv/platform/http';

/**
 * Bindings are declared by hand instead of using the generated global `Env`: `apps/web` type-imports
 * this app (for the route types) and has its own global `Env`, so the two would clash.
 * Keep in sync with wrangler.jsonc and .dev.vars.example.
 */
export type Bindings = {
  HYPERDRIVE: Hyperdrive;
  /** Secret: Google OAuth client id (sad §7). */
  GOOGLE_CLIENT_ID: string;
  /** Secret: Google OAuth client secret; it lives only in the api (ADR-0007). */
  GOOGLE_CLIENT_SECRET: string;
  /** The single company email domain, e.g. `arvest.digital` (PRD §1). */
  COMPANY_EMAIL_DOMAIN: string;
  /** The first admin's address; empty means none is configured (AC-15). */
  FIRST_ADMIN_EMAIL: string;
  /** The web's sign-in return page, registered with Google as the redirect URI. */
  SIGN_IN_RETURN_URL: string;
  /**
   * Local development only (`.dev.vars`): `true` skips the Google `hd` check so a personal account
   * can sign in. Ignored unless SIGN_IN_RETURN_URL is `http://localhost`. Never set in wrangler.jsonc.
   */
  SKIP_HOSTED_DOMAIN_CHECK?: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: HttpEnv['Variables'] & {
    actor: Actor;
    /** The request's one Database, set by `requestDatabase` on first use. */
    database: Db;
  };
};
