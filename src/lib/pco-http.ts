// Planning Center HTTP client with rate-limit manners (READ-ONLY callers).
//
// Every Planning Center request in the app goes through `pcoFetch`, which:
//   1. Paces requests. PCO allows 100 requests per 20 seconds, and it reports
//      the live budget on every response in `X-PCO-API-Request-Rate-Limit` and
//      `X-PCO-API-Request-Rate-Period` (seconds). We space requests to stay at
//      or below RATE_SAFETY of that budget, and when `X-PCO-API-Request-Rate-Count`
//      shows the window is nearly used up we wait for a fresh window.
//   2. Retries rate limits and transient failures (429, 502, 503, 504, and
//      network errors) a capped number of times. A `Retry-After` header wins;
//      otherwise it uses exponential backoff with full jitter.
//
// The budget is shared by everything that uses the same Planning Center
// credentials (other apps included), so the pacer is deliberately
// conservative and a 429 pauses every caller in this process, not just one.

const DEFAULT_LIMIT = 100;
const DEFAULT_PERIOD_MS = 20_000;
/** Use at most this share of the advertised budget (leaves room for other apps). */
const RATE_SAFETY = 0.8;
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export interface PcoHttpDeps {
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  random: () => number;
}

const realDeps: PcoHttpDeps = {
  sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  random: () => Math.random(),
};

let deps: PcoHttpDeps = realDeps;
let limit = DEFAULT_LIMIT;
let periodMs = DEFAULT_PERIOD_MS;
let nextAllowedAt = 0;
let queue: Promise<void> = Promise.resolve();

/** Test hook: swap the clock/sleep/random and reset the pacer state. */
export function resetPcoHttp(overrides: Partial<PcoHttpDeps> = {}): void {
  deps = { ...realDeps, ...overrides };
  limit = DEFAULT_LIMIT;
  periodMs = DEFAULT_PERIOD_MS;
  nextAllowedAt = 0;
  queue = Promise.resolve();
}

/** Minimum spacing between requests for the current budget. */
export function pcoRequestSpacingMs(): number {
  return Math.ceil(periodMs / Math.max(1, Math.floor(limit * RATE_SAFETY)));
}

function positiveNumber(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value.trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Parse a `Retry-After` header (delta-seconds or an HTTP date) into a delay in
 * ms, or null when absent/unparseable. Never negative.
 */
export function parseRetryAfter(value: string | null, nowMs: number): number | null {
  if (value === null || value.trim() === "") return null;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds * 1000));
  const at = Date.parse(value);
  if (Number.isNaN(at)) return null;
  return Math.max(0, at - nowMs);
}

/** Exponential backoff with full jitter: random in [0, min(cap, base * 2^attempt)]. */
export function backoffDelayMs(attempt: number, random: () => number): number {
  const ceiling = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
  return Math.round(ceiling * random());
}

/** Wait for this caller's turn. Calls are serialized so concurrent callers are paced too. */
function acquireSlot(): Promise<void> {
  const turn = queue.then(async () => {
    const wait = nextAllowedAt - deps.now();
    if (wait > 0) await deps.sleep(wait);
    nextAllowedAt = deps.now() + pcoRequestSpacingMs();
  });
  queue = turn.catch(() => undefined);
  return turn;
}

/** Push every caller back until at least `untilMs`. */
function holdUntil(untilMs: number): void {
  nextAllowedAt = Math.max(nextAllowedAt, untilMs);
}

/** Learn the live budget from PCO's rate-limit headers. */
function observe(res: Response): void {
  const headerLimit = positiveNumber(res.headers.get("X-PCO-API-Request-Rate-Limit"));
  const headerPeriod = positiveNumber(res.headers.get("X-PCO-API-Request-Rate-Period"));
  if (headerLimit !== null) limit = headerLimit;
  if (headerPeriod !== null) periodMs = headerPeriod * 1000;

  const count = positiveNumber(res.headers.get("X-PCO-API-Request-Rate-Count"));
  // Nearly out of budget for this window (possibly because another app shares
  // the credentials): let the window drain before the next request.
  if (count !== null && count >= limit * RATE_SAFETY) {
    holdUntil(deps.now() + periodMs);
  }
}

async function discardBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // Nothing to clean up.
  }
}

/**
 * `fetch` for Planning Center: paced, and retried on 429/5xx/network errors up
 * to MAX_RETRIES times. Returns the final Response (which may still be a 429
 * if the limit never cleared; callers treat that as an error). Throws the last
 * network error when every attempt failed to connect.
 */
export async function pcoFetch(url: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    await acquireSlot();

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw err;
      const delay = backoffDelayMs(attempt, deps.random);
      holdUntil(deps.now() + delay);
      continue;
    }

    observe(res);
    if (!RETRYABLE_STATUS.has(res.status) || attempt >= MAX_RETRIES) return res;

    const retryAfter = parseRetryAfter(res.headers.get("Retry-After"), deps.now());
    const delay =
      retryAfter !== null
        ? Math.min(MAX_BACKOFF_MS, retryAfter) + Math.round(500 * deps.random())
        : backoffDelayMs(attempt, deps.random);
    await discardBody(res);
    holdUntil(deps.now() + delay);
  }
}

/** A clear error for a non-OK Planning Center response. */
export function pcoResponseError(res: Response): Error {
  const base = `Planning Center API error (${res.status} ${res.statusText})`;
  if (res.status === 429) {
    return new Error(`${base}. Rate limit still exceeded after ${MAX_RETRIES} retries; try again later.`);
  }
  if (res.status === 401 || res.status === 403) {
    return new Error(`${base}. Check your PCO credentials.`);
  }
  return new Error(`${base}.`);
}
