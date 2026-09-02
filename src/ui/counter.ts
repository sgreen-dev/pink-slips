/**
 * The matches-played counter. The endpoint comes from VITE_COUNTER_URL at build time; when it
 * is unset, or the request fails, both calls resolve to null and the UI shows nothing.
 */

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

export function counterEndpoint(): string | null {
  const raw: unknown = import.meta.env.VITE_COUNTER_URL
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null
}

async function call(
  method: 'GET' | 'POST',
  endpoint: string | null,
  fetcher: Fetcher | undefined,
): Promise<number | null> {
  if (!endpoint || !fetcher) return null
  try {
    const response = await fetcher(endpoint, { method })
    if (!response.ok) return null
    const data: unknown = await response.json()
    const count = (data as { count?: unknown }).count
    return typeof count === 'number' && Number.isFinite(count) ? count : null
  } catch {
    return null
  }
}

export function readMatchCount(
  endpoint: string | null = counterEndpoint(),
  fetcher: Fetcher | undefined = globalThis.fetch,
): Promise<number | null> {
  return call('GET', endpoint, fetcher)
}

/** Adds one finished match to the global count. */
export function recordMatch(
  endpoint: string | null = counterEndpoint(),
  fetcher: Fetcher | undefined = globalThis.fetch,
): Promise<number | null> {
  return call('POST', endpoint, fetcher)
}
