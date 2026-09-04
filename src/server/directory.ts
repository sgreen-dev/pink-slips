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
import {
  CODE_ALPHABET,
  formatRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_LENGTH,
  type RatingChange,
} from '../protocol/messages.ts'
import { MAX_NAME_LENGTH, nameProblem, safeDisplayName } from '../protocol/names.ts'
import {
  isCollectionState,
  isGarageList,
  type CollectionState,
  type SavedGarage,
} from '../protocol/records.ts'
import { updateRatings } from './rating.ts'

/**
 * Accounts (DESIGN.md 13), independent of any platform. A player is made from a name alone:
 * the directory keeps the account, its collection and garages, its rating and record, the
 * sessions that hold it in a browser, and the hash of the recovery code that carries it to
 * another one. Packs are only ever added here: by a match result the room reports, or by a
 * CPU result the client reports, at most one a minute. Nothing a client sends can set a pack
 * count or a rating.
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
  /** Hash of the recovery code; the code itself is never stored. */
  recoveryHash?: string
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

/** A session lasts a year from its last use; it is renewed once a day while in use. */
export const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000
export const SESSION_RENEW_MS = 24 * 60 * 60 * 1000
/** Shortest gap between two CPU results from one account. */
export const CPU_RESULT_GAP_MS = 60_000
export const LEADERBOARD_SIZE = 50

const ACCOUNT = 'acct:'
const PROVIDER = 'prov:'
const SESSION = 'sess:'
const RECOVERY = 'rec:'
const STATS = 'stats'

function cleanName(raw: string): string {
  const name = raw.trim().slice(0, MAX_NAME_LENGTH)
  return name || 'Player'
}

/** The name as it may be shown. Records made before the filter are masked here too. */
function shown(account: Account): string {
  return safeDisplayName(account.name)
}

function maxCounts(a: Collection, b: Collection): Collection {
  const merged: Record<string, number> = { ...a }
  for (const [id, count] of Object.entries(b)) merged[id] = Math.max(merged[id] ?? 0, count)
  return merged
}

function mergeVariants(a: VariantCounts, b: VariantCounts): VariantCounts {
  return { foil: maxCounts(a.foil, b.foil), holo: maxCounts(a.holo, b.holo) }
}

/** A recovery code from random hex: every two hex digits pick one alphabet character. */
export function recoveryCodeFrom(hex: string): string {
  let code = ''
  for (let i = 0; code.length < RECOVERY_LENGTH && i + 2 <= hex.length; i += 2) {
    code += CODE_ALPHABET[parseInt(hex.slice(i, i + 2), 16) % CODE_ALPHABET.length]
  }
  if (code.length < RECOVERY_LENGTH) throw new Error('Not enough randomness for a code')
  return code
}

export class Directory {
  private readonly store: Store
  private readonly random: () => string
  private readonly hash: (text: string) => Promise<string>
  private readonly now: () => number
  private readonly t: typeof TUNABLES

  constructor(
    store: Store,
    random: () => string,
    hash: (text: string) => Promise<string>,
    now: () => number = () => Date.now(),
    t: typeof TUNABLES = TUNABLES,
  ) {
    this.store = store
    this.random = random
    this.hash = hash
    this.now = now
    this.t = t
  }

  /** Why a name cannot be used, or null. An empty name is allowed here and becomes Player. */
  static nameProblem(name: string): string | null {
    return name.trim() === '' ? null : nameProblem(name)
  }

  /**
   * Makes a player from a name and opens a session. The recovery code is returned once. The
   * caller checks the name first with `nameProblem`; a refused name is not stored.
   */
  async createPlayer(
    name: string,
  ): Promise<{ token: string; data: AccountData; recoveryCode: string }> {
    if (Directory.nameProblem(name)) throw new Error('Name refused')
    const id = this.random()
    const code = recoveryCodeFrom(this.random())
    const account: Account = {
      id,
      provider: 'player',
      providerId: id,
      name: cleanName(name),
      rating: this.t.online.ratingStart,
      wins: 0,
      losses: 0,
      claimed: false,
      collection: { owned: starterCollection(), packs: 0, variants: NO_VARIANTS },
      garages: [],
      createdAt: this.now(),
      lastCpuResultAt: 0,
      recoveryHash: await this.hash(code),
    }
    await this.store.put(`${PROVIDER}player:${id}`, id)
    await this.store.put(`${RECOVERY}${account.recoveryHash}`, id)
    await this.save(account)
    const token = await this.openSession(id)
    return { token, data: this.dataOf(account), recoveryCode: formatRecoveryCode(code) }
  }

  /** Takes a player back with the recovery code. Null for a code nobody holds. */
  async recover(raw: string): Promise<{ token: string; data: AccountData } | null> {
    const code = normalizeRecoveryCode(raw)
    if (!code) return null
    const id = await this.store.get<string>(`${RECOVERY}${await this.hash(code)}`)
    const account = id ? await this.load(id) : null
    if (!account) return null
    return { token: await this.openSession(account.id), data: this.dataOf(account) }
  }

  /** Replaces the recovery code; the old one stops working at once. */
  async rotateRecovery(token: string): Promise<string | null> {
    const account = await this.accountFor(token)
    if (!account) return null
    const code = recoveryCodeFrom(this.random())
    const recoveryHash = await this.hash(code)
    if (account.recoveryHash) await this.store.delete(`${RECOVERY}${account.recoveryHash}`)
    await this.store.put(`${RECOVERY}${recoveryHash}`, account.id)
    await this.save({ ...account, recoveryHash })
    return formatRecoveryCode(code)
  }

  async rename(token: string, name: unknown): Promise<AccountData | null> {
    const account = await this.accountFor(token)
    if (!account) return null
    if (typeof name !== 'string' || Directory.nameProblem(name)) return this.dataOf(account)
    const next = { ...account, name: cleanName(name) }
    await this.save(next)
    return this.dataOf(next)
  }

  private async openSession(accountId: string): Promise<string> {
    const token = this.random()
    const session: Session = { accountId, expiresAt: this.now() + SESSION_TTL_MS }
    await this.store.put(`${SESSION}${token}`, session)
    return token
  }

  async accountFor(token: string): Promise<Account | null> {
    const session = await this.store.get<Session>(`${SESSION}${token}`)
    if (!session) return null
    const now = this.now()
    if (session.expiresAt <= now) {
      await this.store.delete(`${SESSION}${token}`)
      return null
    }
    if (session.expiresAt - now < SESSION_TTL_MS - SESSION_RENEW_MS) {
      await this.store.put(`${SESSION}${token}`, { ...session, expiresAt: now + SESSION_TTL_MS })
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
        name: shown(account),
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
   * online rule, unless the room says the match earns none, as for one conceded before any
   * race; a ranked match between two accounts also moves their ratings and records.
   */
  async recordResult(
    winnerId: string | null,
    loserId: string | null,
    ranked: boolean,
    earnsPacks = true,
  ): Promise<MatchOutcome> {
    const winner = winnerId ? await this.load(winnerId) : null
    const loser = loserId ? await this.load(loserId) : null
    const rated = ranked && winner !== null && loser !== null
    const ratings = rated ? updateRatings(winner.rating, loser.rating, this.t) : null
    const outcome: MatchOutcome = { winner: null, loser: null }
    let newlyRated = 0
    const settle = async (account: Account | null, won: boolean): Promise<SideOutcome | null> => {
      if (!account) return null
      const packs = earnsPacks ? packsEarned('online', won, this.t) : 0
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
      .map((a) => ({ id: a.id, name: shown(a), rating: a.rating, wins: a.wins, losses: a.losses }))
  }

  private async save(account: Account): Promise<void> {
    await this.store.put(`${ACCOUNT}${account.id}`, account)
  }
}
