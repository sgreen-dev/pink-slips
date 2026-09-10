import {
  grant,
  grantVariants,
  NO_VARIANTS,
  openPack,
  ownedCount,
  packCards,
  GRANT_VERSION,
  introCollection,
  packsEarned,
  rebaseToIntro,
  type Collection,
  type Mode,
  type Pack,
  type VariantCounts,
  buyCard,
  claimLap,
  garagesAfterLap,
  scrapAll,
} from '../collection/collection.ts'
import {
  applyTransfer,
  protectKeepsakes,
  losesOnly,
  sanitizeTransfer,
  type Transfer,
} from '../collection/stakes.ts'
import { seedRng, TUNABLES } from '../engine/index.ts'
import {
  CODE_ALPHABET,
  formatRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_LENGTH,
  type RatingChange,
} from '../protocol/messages.ts'
import { MAX_NAME_LENGTH, nameProblem, safeDisplayName, stripInvisible } from '../protocol/names.ts'
import {
  isCollectionState,
  isGarageList,
  type CollectionState,
  type SavedGarage,
  normalizeCollection,
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
  /**
   * Sessions opened before this are refused. Rotating the recovery code moves it, so a session
   * opened with a code that has been replaced stops working (DESIGN.md 13).
   */
  sessionsFrom?: number
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
  /** Laps taken (DESIGN.md 12). */
  laps: number
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
  laps: number
}

export interface SideOutcome {
  packs: number
  rating: RatingChange | null
  /** What the account's collection gained and lost under stakes, or null. */
  stakes: Transfer | null
}

export interface MatchOutcome {
  winner: SideOutcome | null
  loser: SideOutcome | null
}

interface Session {
  accountId: string
  expiresAt: number
  /** When this session was opened, against which `Account.sessionsFrom` is read. */
  startedAt?: number
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
/** How long a built leaderboard is reused before the accounts are read again. */
export const LEADERBOARD_CACHE_MS = 30_000

const ACCOUNT = 'acct:'
const PROVIDER = 'prov:'
const SESSION = 'sess:'
const RECOVERY = 'rec:'
/** When each address last made players, for the creation limit. Pruned as it is read. */
const CREATIONS = 'made:'
const STATS = 'stats'

function cleanName(raw: string): string {
  // Invisible characters are cut before the trim, so a name that is only bidi marks becomes
  // Player rather than something that draws as nothing (DESIGN.md 13).
  const name = stripInvisible(raw).trim().slice(0, MAX_NAME_LENGTH)
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
  return {
    foil: maxCounts(a.foil, b.foil),
    holo: maxCounts(a.holo, b.holo),
    chrome: maxCounts(a.chrome, b.chrome),
  }
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
  /** The last built leaderboard, reused for a moment and dropped when a rating moves. */
  private board: { rows: LeaderboardRow[]; at: number; limit: number } | null = null

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
   * Whether an address may make another player, and records it when it may (DESIGN.md 13).
   *
   * This lives on the directory rather than in the worker because the worker is many isolates,
   * per colo and short-lived, so a count held in one of them is not a limit at all: retrying
   * lands in a different isolate with an empty count. The directory is one object for the whole
   * service, so a count kept here is the count. Times older than the window are dropped as they
   * are read, and an address with none left loses its key, so this grows only with the
   * addresses that made a player in the last hour.
   */
  async allowCreation(address: string): Promise<boolean> {
    const key = `${CREATIONS}${address}`
    const now = this.now()
    const window = this.t.online.creationWindowMs
    const kept = ((await this.store.get<number[]>(key)) ?? []).filter((at) => now - at < window)
    if (kept.length >= this.t.online.creationsPerWindow) {
      // Rewrite anyway, so the pruning happens even for an address that is being refused.
      await this.store.put(key, kept)
      return false
    }
    await this.store.put(key, [...kept, now])
    return true
  }

  /**
   * Makes a player from a name and opens a session. The recovery code is returned once. The
   * caller checks the name first with `nameProblem` and the address with `allowCreation`; a
   * refused name is not stored.
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
      collection: {
        owned: introCollection(),
        packs: 0,
        variants: NO_VARIANTS,
        laps: 0,
        grantVersion: GRANT_VERSION,
        credits: 0,
      },
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

  /**
   * Replaces the recovery code. The old one stops working at once, and so does every session
   * opened before now, including any opened with the code being replaced -- which is the point
   * of rotating one. The caller is handed a fresh token, since otherwise the act of securing
   * the account would sign the owner out of it.
   */
  async rotateRecovery(token: string): Promise<{ recoveryCode: string; token: string } | null> {
    const account = await this.accountFor(token)
    if (!account) return null
    const code = recoveryCodeFrom(this.random())
    const recoveryHash = await this.hash(code)
    if (account.recoveryHash) await this.store.delete(`${RECOVERY}${account.recoveryHash}`)
    await this.store.put(`${RECOVERY}${recoveryHash}`, account.id)
    await this.save({ ...account, recoveryHash, sessionsFrom: this.now() })
    await this.signOut(token)
    return { recoveryCode: formatRecoveryCode(code), token: await this.openSession(account.id) }
  }

  async rename(token: string, name: unknown): Promise<AccountData | null> {
    const account = await this.accountFor(token)
    if (!account) return null
    if (typeof name !== 'string' || Directory.nameProblem(name)) return this.dataOf(account)
    const next = { ...account, name: cleanName(name) }
    await this.save(next)
    return this.dataOf(next)
  }

  /**
   * Sessions are stored under a hash of the token, never the token itself, so a read of this
   * object's storage is not a signed-in browser for every player at once. That is how recovery
   * codes have always been kept and a session is the stronger credential of the two: it needs
   * no second step and it renews itself.
   */
  private async sessionKey(token: string): Promise<string> {
    return `${SESSION}${await this.hash(token)}`
  }

  private async openSession(accountId: string): Promise<string> {
    const token = this.random()
    const session: Session = {
      accountId,
      expiresAt: this.now() + SESSION_TTL_MS,
      startedAt: this.now(),
    }
    await this.store.put(await this.sessionKey(token), session)
    return token
  }

  async accountFor(token: string): Promise<Account | null> {
    const key = await this.sessionKey(token)
    let session = await this.store.get<Session>(key)
    if (!session) {
      // A session opened before the keys were hashed still sits under the token itself. It is
      // moved across on first use rather than dropped, so nobody is signed out by this change;
      // a browser that never comes back keeps its old row until the expiry sweeps it.
      const legacyKey = `${SESSION}${token}`
      const legacy = await this.store.get<Session>(legacyKey)
      if (!legacy) return null
      await this.store.delete(legacyKey)
      await this.store.put(key, legacy)
      session = legacy
    }
    const now = this.now()
    if (session.expiresAt <= now) {
      await this.store.delete(key)
      return null
    }
    if (session.expiresAt - now < SESSION_TTL_MS - SESSION_RENEW_MS) {
      await this.store.put(key, { ...session, expiresAt: now + SESSION_TTL_MS })
    }
    const account = await this.load(session.accountId)
    if (!account) return null
    // A recovery code that has been replaced takes its sessions with it. A session with no
    // startedAt predates this and counts as older than any rotation.
    if ((session.startedAt ?? 0) < (account.sessionsFrom ?? 0)) {
      await this.store.delete(key)
      return null
    }
    return account
  }

  async signOut(token: string): Promise<void> {
    await this.store.delete(await this.sessionKey(token))
    // A session that predates hashing may still be under the token; ending one ends both.
    await this.store.delete(`${SESSION}${token}`)
  }

  /**
   * Loads an account, filling what an older record lacks. An account still on the legacy
   * loaner-garage grant is rebased onto the intro set here rather than in a sweep, so the work
   * happens once per account as it is read (DESIGN.md 12).
   */
  async load(id: string): Promise<Account | null> {
    const account = await this.store.get<Account>(`${ACCOUNT}${id}`)
    if (!account) return null
    const collection = normalizeCollection(account.collection)
    if (collection.grantVersion >= GRANT_VERSION) return { ...account, collection }
    const rebased = {
      ...account,
      collection: {
        ...collection,
        owned: rebaseToIntro(collection.owned),
        grantVersion: GRANT_VERSION,
      },
    }
    await this.save(rebased)
    return rebased
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
        laps: account.collection.laps,
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
      const guestState = normalizeCollection(collection)
      // The account is rebased by load; a guest record still on the legacy grant is rebased
      // here, so the merge below cannot hand the legacy cards back through the per-id max.
      const guestOwned =
        guestState.grantVersion >= GRANT_VERSION
          ? guestState.owned
          : rebaseToIntro(guestState.owned)
      next = {
        ...next,
        collection: {
          owned: maxCounts(account.collection.owned, guestOwned),
          packs: account.collection.packs + collection.packs,
          variants: mergeVariants(account.collection.variants, guestState.variants),
          laps: Math.max(account.collection.laps, guestState.laps),
          grantVersion: GRANT_VERSION,
          // A balance, not a count of held cards, so the two sides add rather than take the larger.
          credits: account.collection.credits + guestState.credits,
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

  /** Scraps the account's surplus copies for credits (DESIGN.md 12). */
  async scrap(token: string): Promise<AccountData | 'refused' | null> {
    const account = await this.accountFor(token)
    if (!account) return null
    const collection = scrapAll(account.collection, this.t)
    if (!collection) return 'refused'
    const next = { ...account, collection }
    await this.save(next)
    return this.dataOf(next)
  }

  /** Buys one card the account does not own, with its credits (DESIGN.md 12). */
  async buy(token: string, cardId: unknown): Promise<AccountData | 'refused' | null> {
    const account = await this.accountFor(token)
    if (!account) return null
    if (typeof cardId !== 'string') return 'refused'
    const collection = buyCard(account.collection, cardId, this.t)
    if (!collection) return 'refused'
    const next = { ...account, collection }
    await this.save(next)
    return this.dataOf(next)
  }

  /** Opens the next pack with the seed the adapter supplies. Null with nothing to open. */
  async openPack(token: string, seed: number): Promise<{ pack: Pack; data: AccountData } | null> {
    const account = await this.accountFor(token)
    if (!account || account.collection.packs <= 0) return null
    const [pack] = openPack(seedRng(seed), this.t, account.collection.laps)
    const cards = packCards(pack)
    const collection: CollectionState = {
      owned: grant(
        account.collection.owned,
        cards.map((card) => card.id),
      ),
      packs: account.collection.packs - 1,
      variants: grantVariants(account.collection.variants, cards),
      grantVersion: account.collection.grantVersion,
      credits: account.collection.credits,
      laps: account.collection.laps,
    }
    const next = { ...account, collection }
    await this.save(next)
    return { pack, data: this.dataOf(next) }
  }

  /**
   * Takes the lap (DESIGN.md 12, Laps): the collection returns to the starters with the
   * keepsake in chrome, and garages needing a given-up car go. Refused unless every car is
   * owned and the keepsake is one of them.
   */
  async claimLap(token: string, keepsakeId: unknown): Promise<AccountData | 'refused' | null> {
    const account = await this.accountFor(token)
    if (!account) return null
    if (typeof keepsakeId !== 'string') return 'refused'
    const collection = claimLap(account.collection, keepsakeId)
    if (!collection) return 'refused'
    const next = {
      ...account,
      collection,
      garages: garagesAfterLap(account.garages, collection.owned),
    }
    await this.save(next)
    return this.dataOf(next)
  }

  /**
   * A finished CPU or hotseat match reported by the client. The client could lie, so the
   * grant is capped at one report a minute; a repeat inside the gap earns nothing.
   */
  async cpuResult(
    token: string,
    mode: unknown,
    won: unknown,
    stakes: unknown = null,
  ): Promise<{ packs: number; stakes: Transfer | null; data: AccountData } | null> {
    const account = await this.accountFor(token)
    if (!account) return null
    if (mode !== 'cpu' && mode !== 'hotseat') {
      return { packs: 0, stakes: null, data: this.dataOf(account) }
    }
    const now = this.now()
    if (now - account.lastCpuResultAt < CPU_RESULT_GAP_MS) {
      return { packs: 0, stakes: null, data: this.dataOf(account) }
    }
    const packs = packsEarned(mode as Mode, won === true, this.t)
    // Stakes against the CPU move cars one way only, so only the losses are taken from the
    // client. Stakes need a loaner garage on the CPU side (DESIGN.md 12), every car in one is
    // exempt from stakes, and so a won CPU match cannot hand the player a card. A report that
    // claims otherwise is either an old client or an invention; either way its gains are
    // dropped rather than minting cards a match could never have produced. Losses stay
    // trusted, since a client that lies about them only robs itself.
    const transfer = mode === 'cpu' ? losesOnly(sanitizeTransfer(stakes)) : null
    const owned = transfer
      ? // A chrome keepsake never changes hands (DESIGN.md 12), which the guest path has always
        // honoured and this one did not.
        applyTransfer(account.collection.owned, transfer, account.collection.variants.chrome)
      : account.collection.owned
    const next: Account = {
      ...account,
      lastCpuResultAt: now,
      collection: { ...account.collection, packs: account.collection.packs + packs, owned },
    }
    await this.save(next)
    return { packs, stakes: transfer, data: this.dataOf(next) }
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
    transfers: { winner: Transfer; loser: Transfer } | null = null,
  ): Promise<MatchOutcome> {
    const winner = winnerId ? await this.load(winnerId) : null
    const loser = loserId ? await this.load(loserId) : null
    // A keepsake never changes hands: the loser keeps it and the winner gains nothing for it.
    if (transfers && loser)
      transfers = protectKeepsakes(transfers, loser.collection.variants.chrome)
    const rated = ranked && winner !== null && loser !== null
    const ratings = rated ? updateRatings(winner.rating, loser.rating, this.t) : null
    const outcome: MatchOutcome = { winner: null, loser: null }
    let newlyRated = 0
    const settle = async (account: Account | null, won: boolean): Promise<SideOutcome | null> => {
      if (!account) return null
      const packs = earnsPacks ? packsEarned('online', won, this.t) : 0
      const change = ratings ? (won ? ratings.winner : ratings.loser) : null
      if (rated && account.wins + account.losses === 0) newlyRated += 1
      const transfer = transfers ? sanitizeTransfer(won ? transfers.winner : transfers.loser) : null
      const owned = transfer
        ? // Each side's own keepsakes, so the winner keeps theirs too: protectKeepsakes above
          // only ever sees the loser's, and a winner can lose a car to the loser mid-match.
          applyTransfer(account.collection.owned, transfer, account.collection.variants.chrome)
        : account.collection.owned
      const next: Account = {
        ...account,
        collection: { ...account.collection, packs: account.collection.packs + packs, owned },
        rating: change ? change.after : account.rating,
        wins: account.wins + (rated && won ? 1 : 0),
        losses: account.losses + (rated && !won ? 1 : 0),
      }
      await this.save(next)
      return { packs, rating: change, stakes: transfer }
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

  /**
   * The top rated players. Building it reads every account, and the route is open to anyone, so
   * the answer is held for `LEADERBOARD_CACHE_MS` and a rated result clears it. Without that,
   * repeating one unauthenticated request scans the whole account table each time, on the one
   * object that also serves matchmaking and the identity check for every room connect.
   */
  async leaderboard(limit: number = LEADERBOARD_SIZE): Promise<LeaderboardRow[]> {
    const now = this.now()
    const held = this.board
    if (held && held.limit === limit && now - held.at < LEADERBOARD_CACHE_MS) return held.rows
    const rows = await this.buildLeaderboard(limit)
    this.board = { rows, at: now, limit }
    return rows
  }

  private async buildLeaderboard(limit: number): Promise<LeaderboardRow[]> {
    const accounts = await this.store.list<Account>(ACCOUNT)
    return [...accounts.values()]
      .filter((a) => a.wins + a.losses > 0)
      .sort((a, b) => b.rating - a.rating || b.wins - a.wins || a.createdAt - b.createdAt)
      .slice(0, limit)
      .map((a) => ({
        id: a.id,
        name: shown(a),
        rating: a.rating,
        wins: a.wins,
        losses: a.losses,
        laps: a.collection.laps ?? 0,
      }))
  }

  /**
   * Removes a player and everything the directory holds for them (backlog Q39). Returns false
   * for an id nobody has, so a caller can tell a wrong id from a real deletion.
   *
   * An account is spread across several keys and every one has to go, or what is left behind
   * either resolves to nothing or keeps counting. The sessions are the awkward part: they are
   * keyed by a hash of their token, so they cannot be derived from the account and are found by
   * reading each one and matching the id it holds. Leaving them would be a slow leak of keys
   * that resolve to a missing account, which `accountFor` already fails closed on, but a delete
   * that leaves anything behind is not one.
   */
  async deletePlayer(id: string): Promise<boolean> {
    const account = await this.load(id)
    if (!account) return false
    const sessions = await this.store.list<Session>(SESSION)
    for (const [key, session] of sessions) {
      if (session.accountId === id) await this.store.delete(key)
    }
    if (account.recoveryHash) await this.store.delete(`${RECOVERY}${account.recoveryHash}`)
    await this.store.delete(`${PROVIDER}${account.provider}:${account.providerId}`)
    await this.store.delete(`${ACCOUNT}${id}`)
    // The rated count is a running total, not something derived, so it has to be corrected here
    // or it drifts up by one for every player removed.
    if (account.wins + account.losses > 0) {
      const stats = (await this.store.get<Stats>(STATS)) ?? { rated: 0 }
      await this.store.put(STATS, { rated: Math.max(0, stats.rated - 1) })
    }
    // The board shows this player, so the cached copy is now wrong.
    this.board = null
    return true
  }

  private async save(account: Account): Promise<void> {
    // Every account write can change a name, a rating or a record, all of which the board shows.
    this.board = null
    await this.store.put(`${ACCOUNT}${account.id}`, account)
  }
}
