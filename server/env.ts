import type { AccountDirectory } from './accounts.ts'
import type { Analytics } from './analytics.ts'
import type { MatchRoom } from './rooms.ts'

/**
 * The bindings both Durable Objects and the router share. Its own file so the two objects can
 * live apart without importing each other (backlog Q37); the class types here are type-only,
 * so nothing circular reaches the bundle.
 */
export interface Env {
  ROOMS: DurableObjectNamespace<MatchRoom>
  ACCOUNTS: DurableObjectNamespace<AccountDirectory>
  ANALYTICS: DurableObjectNamespace<Analytics>
  /** The commit this worker was deployed from, set by `scripts/deploy-worker.ts` (backlog Q36). */
  COMMIT?: string
  /**
   * Guards the admin routes (backlog Q39). Set with `npx wrangler secret put ADMIN_TOKEN`, never
   * in `wrangler.toml`. Unset, the admin routes answer 404 rather than existing unprotected.
   */
  ADMIN_TOKEN?: string
}

/** The one directory object the whole service shares. */
export function directoryOf(env: Env): DurableObjectStub<AccountDirectory> {
  return env.ACCOUNTS.get(env.ACCOUNTS.idFromName('main'))
}
