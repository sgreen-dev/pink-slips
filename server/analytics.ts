import { DurableObject } from 'cloudflare:workers'
import {
  dayKey,
  parseBatch,
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

/** Days kept before a row is pruned. Beyond this the daily totals are all that remain useful. */
const KEEP_DAYS = 400

export class Analytics extends DurableObject<Env> {
  private ready = false

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

  /** Drops rows older than `KEEP_DAYS`, so the object does not grow without end. */
  async prune(now: number): Promise<void> {
    this.setUp()
    const cutoff = dayKey(now - KEEP_DAYS * 86_400_000)
    const sql = this.ctx.storage.sql
    sql.exec('DELETE FROM seen WHERE day < ?', cutoff)
    sql.exec('DELETE FROM counts WHERE day < ?', cutoff)
  }
}

/** The one analytics object the whole game writes to. */
export function analyticsOf(env: Env): DurableObjectStub<Analytics> {
  return env.ANALYTICS.get(env.ANALYTICS.idFromName('main'))
}

export type { EventName }
