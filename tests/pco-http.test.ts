import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  backoffDelayMs,
  parseRetryAfter,
  pcoFetch,
  pcoRequestSpacingMs,
  pcoResponseError,
  resetPcoHttp,
} from "../src/lib/pco-http";

const URL_A = "https://api.planningcenteronline.com/calendar/v2/events";

/** A fake clock: sleep() advances time instantly and records each wait. */
function fakeClock(random = 0.5) {
  let now = 1_000_000;
  const sleeps: number[] = [];
  resetPcoHttp({
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
    random: () => random,
  });
  return { sleeps, advance: (ms: number) => (now += ms) };
}

function response(status: number, headers: Record<string, string> = {}): Response {
  return new Response(status === 200 ? "{}" : "busy", { status, headers });
}

beforeEach(() => {
  resetPcoHttp();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetPcoHttp();
});

describe("parseRetryAfter", () => {
  it("reads delta-seconds", () => {
    expect(parseRetryAfter("7", 0)).toBe(7000);
  });

  it("reads an HTTP date relative to now", () => {
    const now = Date.parse("2026-11-16T12:00:00Z");
    expect(parseRetryAfter("Mon, 16 Nov 2026 12:00:12 GMT", now)).toBe(12_000);
  });

  it("ignores missing or garbage values", () => {
    expect(parseRetryAfter(null, 0)).toBeNull();
    expect(parseRetryAfter("soon", 0)).toBeNull();
  });
});

describe("backoffDelayMs", () => {
  it("grows exponentially with full jitter and is capped", () => {
    expect(backoffDelayMs(0, () => 1)).toBe(1000);
    expect(backoffDelayMs(3, () => 1)).toBe(8000);
    expect(backoffDelayMs(3, () => 0.25)).toBe(2000);
    expect(backoffDelayMs(20, () => 1)).toBe(60_000);
  });
});

describe("pcoFetch", () => {
  it("honors Retry-After on a 429, then succeeds", async () => {
    const { sleeps } = fakeClock(0);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(429, { "Retry-After": "5" }))
      .mockResolvedValueOnce(response(200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await pcoFetch(URL_A);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([5000]);
  });

  it("backs off exponentially without Retry-After and gives up after the cap", async () => {
    const { sleeps } = fakeClock(1);
    const fetchMock = vi.fn().mockImplementation(async () => response(429));
    vi.stubGlobal("fetch", fetchMock);

    const res = await pcoFetch(URL_A);

    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(6); // first try + 5 retries
    expect(sleeps).toEqual([1000, 2000, 4000, 8000, 16000]);
    expect(pcoResponseError(res).message).toMatch(/Rate limit still exceeded/);
  });

  it("does not retry client errors such as 401", async () => {
    fakeClock();
    const fetchMock = vi.fn().mockResolvedValue(response(401));
    vi.stubGlobal("fetch", fetchMock);

    const res = await pcoFetch(URL_A);

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(pcoResponseError(res).message).toMatch(/Check your PCO credentials/);
  });

  it("retries network errors and rethrows when they persist", async () => {
    fakeClock(0);
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(pcoFetch(URL_A)).rejects.toThrow("fetch failed");
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("paces back-to-back requests using PCO's advertised budget", async () => {
    const { sleeps } = fakeClock();
    const headers = {
      "X-PCO-API-Request-Rate-Limit": "50",
      "X-PCO-API-Request-Rate-Period": "10",
      "X-PCO-API-Request-Rate-Count": "1",
    };
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => response(200, headers)));

    await pcoFetch(URL_A);
    await pcoFetch(URL_A);
    await pcoFetch(URL_A);

    // 10 s / (50 * 0.8) = 250 ms between requests.
    expect(pcoRequestSpacingMs()).toBe(250);
    expect(sleeps).toEqual([250, 250]);
  });

  it("waits a full period when the shared window is nearly spent", async () => {
    const { sleeps } = fakeClock();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () =>
        response(200, {
          "X-PCO-API-Request-Rate-Limit": "100",
          "X-PCO-API-Request-Rate-Period": "20",
          "X-PCO-API-Request-Rate-Count": "95",
        }),
      ),
    );

    await pcoFetch(URL_A);
    await pcoFetch(URL_A);

    expect(sleeps).toEqual([20_000]);
  });

  it("serializes concurrent callers through the pacer", async () => {
    const { sleeps } = fakeClock();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => response(200)));

    await Promise.all([pcoFetch(URL_A), pcoFetch(URL_A), pcoFetch(URL_A)]);

    // Default budget: 20 s / (100 * 0.8) = 250 ms apart.
    expect(sleeps).toEqual([250, 250]);
  });
});
