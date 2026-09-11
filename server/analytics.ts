import { DurableObject } from 'cloudflare:workers'
import {
  admitsBrowser,
  dayKey,
  parseBatch,
  PRUNE_EVERY_MS,
  pruneCutoff,
  type DayCounts,
  type EventName,
  type Report,
} from '../src/server/analytics.ts'
import type { Env } from './env.ts'

/**
 * Where the counts live (backlog Q40). One Durable Object for the whole game, using its SQLite
 * storage directly, because counting distinct browsers is a thing a database does honestly and
 * a key-value store does not: a set of ids per day read, changed and written back loses one
 * whenever two arrive together.
 *
 * Three tables and nothing else. `seen` is one row per browser per day, which is what makes
 * "how many played today" answerable; `first_day` is when a browser was first seen, which is
 * what makes new against returning answerable; `counts` is a running total per event per day.
 * No row anywhere holds a time of day, an address, a name, or anything joined to an account.
 */

export class Analytics extends DurableObject<Env> {
  private ready = false
  /** Whether a prune has been seen to be scheduled since this object last woke. */
  private armed = false

  private setUp(): void {
    if (this.ready) return
    const sql = this.ctx.storage.sql
    sql.exec(`CREATE TABLE IF NOT EXISTS seen (
      day TEXT NOT NULL, visitor TEXT NOT NULL, PRIMARY KEY (day, visitor)
    )`)
    sql.exec(`CREATE TABLE IF NOT EXISTS first_day (
      visitor TEXT PRIMARY KEY, day TEXT NOT NULL
    )`)
    sql.exec(`CREATE TABLE IF NOT EXISTS counts (
      day TEXT NOT NULL, name TEXT NOT NULL, total INTEGER NOT NULL, PRIMARY KEY (day, name)
    )`)
    this.ready = true
  }

  /** Files a batch from one browser. Returns false when there was nothing usable in it. */
  async record(body: unknown, now: number): Promise<boolean> {
    const batch = parseBatch(body)
    if (!batch) return false
    this.setUp()
    const sql = this.ctx.storage.sql
    const day = dayKey(now)
    // A day holds so many browsers and no more (backlog S17). It is the day that fills, not a
    // sender that is refused: no address is looked at, since none is ever stored.
    const known =
      sql.exec('SELECT 1 FROM seen WHERE day = ? AND visitor = ?', day, batch.visitor).toArray()
        .length > 0
    let today = 0
    if (!known) {
      const [row] = sql
        .exec<{ n: number }>('SELECT COUNT(*) AS n FROM seen WHERE day = ?', day)
        .toArray()
      today = row?.n ?? 0
    }
    if (!admitsBrowser(today, known)) return false
    sql.exec('INSERT OR IGNORE INTO seen (day, visitor) VALUES (?, ?)', day, batch.visitor)
    sql.exec('INSERT OR IGNORE INTO first_day (visitor, day) VALUES (?, ?)', batch.visitor, day)
    for (const name of batch.events) {
      sql.exec(
        `INSERT INTO counts (day, name, total) VALUES (?, ?, 1)
         ON CONFLICT (day, name) DO UPDATE SET total = total + 1`,
        day,
        name,
      )
    }
    await this.arm(now)
    return true
  }

  /** The report the owner reads. Nothing here is public; the route asking for it needs the secret. */
  async report(now: number, days = 30): Promise<Report> {
    this.setUp()
    const sql = this.ctx.storage.sql
    const since = dayKey(now - (days - 1) * 86_400_000)

    const perDay = new Map<string, DayCounts>()
    const dayOf = (day: string): DayCounts => {
      const row = perDay.get(day) ?? { day, visitors: 0, newVisitors: 0, events: {} }
      perDay.set(day, row)
      return row
    }
    for (const row of sql
      .exec<{ day: string; n: number }>(
        'SELECT day, COUNT(*) AS n FROM seen WHERE day >= ? GROUP BY day',
        since,
      )
      .toArray()) {
      dayOf(row.day).visitors = row.n
    }
    for (const row of sql
      .exec<{ day: string; n: number }>(
        'SELECT day, COUNT(*) AS n FROM first_day WHERE day >= ? GROUP BY day',
        since,
      )
      .toArray()) {
      dayOf(row.day).newVisitors = row.n
    }
    for (const row of sql
      .exec<{ day: string; name: string; total: number }>(
        'SELECT day, name, total FROM counts WHERE day >= ?',
        since,
      )
      .toArray()) {
      dayOf(row.day).events[row.name] = row.total
    }

    const active = (window: number): number => {
      const from = dayKey(now - (window - 1) * 86_400_000)
      const [row] = sql
        .exec<{ n: number }>('SELECT COUNT(DISTINCT visitor) AS n FROM seen WHERE day >= ?', from)
        .toArray()
      return row?.n ?? 0
    }

    // A browser that came back on a different day, which is the only retention this can see.
    const [all] = sql.exec<{ n: number }>('SELECT COUNT(DISTINCT visitor) AS n FROM seen').toArray()
    const [repeat] = sql
      .exec<{ n: number }>(
        'SELECT COUNT(*) AS n FROM (SELECT visitor FROM seen GROUP BY visitor HAVING COUNT(*) > 1)',
      )
      .toArray()
    const total = all?.n ?? 0

    return {
      days: [...perDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
      actives: { day: active(1), week: active(7), month: active(30) },
      returningShare: total === 0 ? 0 : (repeat?.n ?? 0) / total,
    }
  }

  /**
   * Drops the days older than `KEEP_DAYS`, and the first sighting of every browser no kept day
   * still names, so the object does not grow without end (backlog S17).
   *
   * A first sighting stays for as long as its browser is still being seen, so one that keeps
   * coming back is never counted as new again; it goes only when every day it was seen on has
   * gone. Until this, `first_day` was never pruned at all, and it is the one table that grows
   * with every browser ever seen. A browser away for longer than `KEEP_DAYS` comes back as new.
   */
  async prune(now: number): Promise<void> {
    this.setUp()
    const cutoff = pruneCutoff(now)
    const sql = this.ctx.storage.sql
    sql.exec('DELETE FROM seen WHERE day < ?', cutoff)
    sql.exec('DELETE FROM counts WHERE day < ?', cutoff)
    sql.exec('DELETE FROM first_day WHERE visitor NOT IN (SELECT visitor FROM seen)')
  }

  /**
   * Makes sure a prune is coming (backlog S17). `prune` was written with this object and nothing
   * ever called it: no route, no alarm, no schedule. The one alarm a Durable Object has is set on
   * the first batch filed after the object wakes, if none is already set, and each prune sets the
   * next one, so the object prunes itself once a day for as long as anything is being counted.
   */
  private async arm(now: number): Promise<void> {
    if (this.armed) return
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(now + PRUNE_EVERY_MS)
    }
    this.armed = true
  }

  override async alarm(): Promise<void> {
    // Cleared first, so a prune that fails for good leaves the next batch to set a new alarm.
    this.armed = false
    const now = Date.now()
    await this.prune(now)
    await this.ctx.storage.setAlarm(now + PRUNE_EVERY_MS)
  }
}

/** The one analytics object the whole game writes to. */
export function analyticsOf(env: Env): DurableObjectStub<Analytics> {
  return env.ANALYTICS.get(env.ANALYTICS.idFromName('main'))
}

export type { EventName }
