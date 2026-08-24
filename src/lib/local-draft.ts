export const LOCAL_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type DraftEnvelope<T> = {
  version: 2;
  savedAt: number;
  data: T;
};

export type ParsedLocalDraft<T> =
  | { status: "ready"; data: Partial<T> }
  | { status: "expired" }
  | { status: "invalid" };

export function serializeLocalDraft<T>(data: T, now = Date.now()): string {
  const envelope: DraftEnvelope<T> = { version: 2, savedAt: now, data };
  return JSON.stringify(envelope);
}

export function parseLocalDraft<T>(
  raw: string,
  now = Date.now(),
  ttlMs = LOCAL_DRAFT_TTL_MS,
): ParsedLocalDraft<T> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { status: "invalid" };
    }

    const candidate = parsed as {
      version?: unknown;
      savedAt?: unknown;
      data?: unknown;
    };
    if (candidate.version === 2) {
      if (
        typeof candidate.savedAt !== "number" ||
        !candidate.data ||
        typeof candidate.data !== "object" ||
        Array.isArray(candidate.data)
      ) {
        return { status: "invalid" };
      }
      if (now - candidate.savedAt > ttlMs) return { status: "expired" };
      return { status: "ready", data: candidate.data as Partial<T> };
    }

    // Continue one existing v1 draft, then save it in the expiring v2 format.
    return { status: "ready", data: parsed as Partial<T> };
  } catch {
    return { status: "invalid" };
  }
}
