import {
  grant,
  grantVariants,
  NO_VARIANTS,
  openPack,
  ownedCount,
  packCards,
  packsEarned,
  starterCollection,
  type Collection,
  type Mode,
  type Pack,
  type VariantCounts,
} from '../collection/collection.ts'
import { seedRng, TUNABLES } from '../engine/index.ts'
import { MAX_NAME_LENGTH, type RatingChange } from '../protocol/messages.ts'
import {
  isCollectionState,
  isGarageList,
  type CollectionState,
  type SavedGarage,
} from '../protocol/records.ts'
import { updateRatings } from './rating.ts'

/**
 * Accounts (DESIGN.md 13), independent of any platform. The directory holds every account,
 * its collection and garages, its rating and record, and the sessions that sign it in. Packs
 * are only ever added here: by a match result the room reports, or by a CPU result the client
 * reports, at most one a minute. Nothing a client sends can set a pack count or a rating.
 */

/** What the directory needs from storage. The adapter maps it onto the platform. */
export interface Store {
  get<T>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  /** Every value under the prefix, keyed by its full key. */
  list<T>(prefix: string): Promise<Map<string, T>>
}

export interface Account {
  id: string
  provider: string
  providerId: string
  name: string
  rating: number
  wins: number
  losses: number
  /** True once the guest data from the browser that first signed in has been merged. */
  claimed: boolean
  collection: CollectionState
  garages: SavedGarage[]
  createdAt: number
  /** When the last CPU result was accepted, for the rate limit. */
  lastCpuResultAt: number
}

/** The public face of an account. */
export interface Profile {
  id: string
  name: string
  rating: number
  wins: number
  losses: number
  /** Distinct cards owned. */
  cards: number
  packs: number
  claimed: boolean
}

export interface AccountData {
  profile: Profile
  collection: CollectionState
  garages: SavedGarage[]
}

export interface LeaderboardRow {
  id: string
  name: string
  rating: number
  wins: number
  losses: number
}

export interface SideOutcome {
  packs: number
  rating: RatingChange | null
}

export interface MatchOutcome {
  winner: SideOutcome | null
  loser: SideOutcome | null
}

interface Session {
  accountId: string
  expiresAt: number
}

interface Stats {
  /** Accounts that have played at least one ranked match. */
  rated: number
}

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** Shortest gap between two CPU results from one account. */
export const CPU_RESULT_GAP_MS = 60_000
export const LEADERBOARD_SIZE = 50

const ACCOUNT = 'acct:'
const PROVIDER = 'prov:'
const SESSION = 'sess:'
const STATS = 'stats'

function cleanName(raw: string): string {
  const name = raw.trim().slice(0, MAX_NAME_LENGTH)
  return name || 'Player'
}

function maxCounts(a: Collection, b: Collection): Collection {
  const merged: Record<string, number> = { ...a }
  for (const [id, count] of Object.entries(b)) merged[id] = Math.max(merged[id] ?? 0, count)
  return merged
}

function mergeVariants(a: VariantCounts, b: VariantCounts): VariantCounts {
  return { foil: maxCounts(a.foil, b.foil), holo: maxCounts(a.holo, b.holo) }
}

export class Directory {
  private readonly store: Store
  private readonly random: () => string
  private readonly now: () => number
  private readonly t: typeof TUNABLES

  constructor(
    store: Store,
    random: () => string,
    now: () => number = () => Date.now(),
    t: typeof TUNABLES = TUNABLES,
  ) {
    this.store = store
    this.random = random
    this.now = now
    this.t = t
  }

  /** Signs a provider identity in, creating the account the first time, and opens a session. */
  async signIn(
    provider: string,
    providerId: string,
    name: string,
  ): Promise<{ token: string; data: AccountData; created: boolean }> {
    const key = `${PROVIDER}${provider}:${providerId}`
    let id = await this.store.get<string>(key)
    let account = id ? await this.store.get<Account>(`${ACCOUNT}${id}`) : undefined
    let created = false
    if (!account) {
      id = this.random()
      account = {
        id,
        provider,
        providerId,
        name: cleanName(name),
        rating: this.t.online.ratingStart,
        wins: 0,
        losses: 0,
        claimed: false,
        collection: { owned: starterCollection(), packs: 0, variants: NO_VARIANTS },
        garages: [],
        createdAt: this.now(),
        lastCpuResultAt: 0,
      }
      created = true
      await this.store.put(key, id)
      await this.save(account)
    }
    const token = this.random()
    const session: Session = { accountId: account.id, expiresAt: this.now() + SESSION_TTL_MS }
    await this.store.put(`${SESSION}${token}`, session)
    return { token, data: this.dataOf(account), created }
  }

  async accountFor(token: string): Promise<Account | null> {
    const session = await this.store.get<Session>(`${SESSION}${token}`)
    if (!session) return null
    if (session.expiresAt <= this.now()) {
      await this.store.delete(`${SESSION}${token}`)
      return null
    }
    return (await this.store.get<Account>(`${ACCOUNT}${session.accountId}`)) ?? null
  }

  async signOut(token: string): Promise<void> {
    await this.store.delete(`${SESSION}${token}`)
  }

  async load(id: string): Promise<Account | null> {
    return (await this.store.get<Account>(`${ACCOUNT}${id}`)) ?? null
  }

  dataOf(account: Account): AccountData {
    return {
      profile: {
        id: account.id,
        name: account.name,
        rating: account.rating,
        wins: account.wins,
        losses: account.losses,
        cards: ownedCount(account.collection.owned),
        packs: account.collection.packs,
        claimed: account.claimed,
      },
      collection: account.collection,
      garages: account.garages,
    }
  }

  /**
   * Merges the guest data from the browser that signed in, once. Card counts take the larger
   * of the two, packs add up, and the guest's garages are kept. A second claim changes nothing.
   */
  async claim(token: string, guest: unknown): Promise<AccountData | null> {
    const account = await this.accountFor(token)
    if (!account) return null
    if (account.claimed) return this.dataOf(account)
    const record = (guest ?? {}) as Record<string, unknown>
    const collection = record['collection']
    const garages = record['garages']
    let next: Account = { ...account, claimed: true }
    if (isCollectionState(collection)) {
      next = {
        ...next,
        collection: {
          owned: maxCounts(account.collection.owned, collection.owned),
          packs: account.collection.packs + collection.packs,
          variants: mergeVariants(account.collection.variants, collection.variants),
        },
      }
    }
    if (isGarageList(garages)) {
      const held = new Set(account.garages.map((g) => g.id))
      next = { ...next, garages: [...account.garages, ...garages.filter((g) => !held.has(g.id))] }
    }
    await this.save(next)
    return this.dataOf(next)
  }

  /** Replaces the saved garages. Anything else in the body is ignored. */
  async saveGarages(token: string, garages: unknown): Promise<AccountData | null> {
    const account = await this.accountFor(token)
    if (!account) return null
    if (!isGarageList(garages)) return this.dataOf(account)
    const next = { ...account, garages }
    await this.save(next)
    return this.dataOf(next)
  }

  /** Opens the next pack with the seed the adapter supplies. Null with nothing to open. */
  async openPack(token: string, seed: number): Promise<{ pack: Pack; data: AccountData } | null> {
    const account = await this.accountFor(token)
    if (!account || account.collection.packs <= 0) return null
    const [pack] = openPack(seedRng(seed), this.t)
    const cards = packCards(pack)
    const collection: CollectionState = {
      owned: grant(
        account.collection.owned,
        cards.map((card) => card.id),
      ),
      packs: account.collection.packs - 1,
      variants: grantVariants(account.collection.variants, cards),
    }
    const next = { ...account, collection }
    await this.save(next)
    return { pack, data: this.dataOf(next) }
  }

  /**
   * A finished CPU or hotseat match reported by the client. The client could lie, so the
   * grant is capped at one report a minute; a repeat inside the gap earns nothing.
   */
  async cpuResult(
    token: string,
    mode: unknown,
    won: unknown,
  ): Promise<{ packs: number; data: AccountData } | null> {
    const account = await this.accountFor(token)
    if (!account) return null
    if (mode !== 'cpu' && mode !== 'hotseat') return { packs: 0, data: this.dataOf(account) }
    const now = this.now()
    if (now - account.lastCpuResultAt < CPU_RESULT_GAP_MS) {
      return { packs: 0, data: this.dataOf(account) }
    }
    const packs = packsEarned(mode as Mode, won === true, this.t)
    const next: Account = {
      ...account,
      lastCpuResultAt: now,
      collection: { ...account.collection, packs: account.collection.packs + packs },
    }
    await this.save(next)
    return { packs, data: this.dataOf(next) }
  }

  /**
   * A finished online match, reported by the room. Each signed-in side earns packs by the
   * online rule; a ranked match between two accounts also moves their ratings and records.
   */
  async recordResult(
    winnerId: string | null,
    loserId: string | null,
    ranked: boolean,
  ): Promise<MatchOutcome> {
    const winner = winnerId ? await this.load(winnerId) : null
    const loser = loserId ? await this.load(loserId) : null
    const rated = ranked && winner !== null && loser !== null
    const ratings = rated ? updateRatings(winner.rating, loser.rating, this.t) : null
    const outcome: MatchOutcome = { winner: null, loser: null }
    let newlyRated = 0
    const settle = async (account: Account | null, won: boolean): Promise<SideOutcome | null> => {
      if (!account) return null
      const packs = packsEarned('online', won, this.t)
      const change = ratings ? (won ? ratings.winner : ratings.loser) : null
      if (rated && account.wins + account.losses === 0) newlyRated += 1
      const next: Account = {
        ...account,
        collection: { ...account.collection, packs: account.collection.packs + packs },
        rating: change ? change.after : account.rating,
        wins: account.wins + (rated && won ? 1 : 0),
        losses: account.losses + (rated && !won ? 1 : 0),
      }
      await this.save(next)
      return { packs, rating: change }
    }
    outcome.winner = await settle(winner, true)
    outcome.loser = await settle(loser, false)
    if (newlyRated > 0) {
      const stats = (await this.store.get<Stats>(STATS)) ?? { rated: 0 }
      await this.store.put(STATS, { rated: stats.rated + newlyRated })
    }
    return outcome
  }

  async ratedCount(): Promise<number> {
    return ((await this.store.get<Stats>(STATS)) ?? { rated: 0 }).rated
  }

  async leaderboard(limit: number = LEADERBOARD_SIZE): Promise<LeaderboardRow[]> {
    const accounts = await this.store.list<Account>(ACCOUNT)
    return [...accounts.values()]
      .filter((a) => a.wins + a.losses > 0)
      .sort((a, b) => b.rating - a.rating || b.wins - a.wins || a.createdAt - b.createdAt)
      .slice(0, limit)
      .map(({ id, name, rating, wins, losses }) => ({ id, name, rating, wins, losses }))
  }

  private async save(account: Account): Promise<void> {
    await this.store.put(`${ACCOUNT}${account.id}`, account)
  }
}
