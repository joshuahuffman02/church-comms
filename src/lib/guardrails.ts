// Pure guardrail evaluators. These take ALREADY-GROUPED scheduled data + settings
// and return warning/block signals. No DB access, no Date math, no I/O — every
// input is plain data so the rules are trivially unit-testable. The thin
// `guardrails-service` does the querying/grouping and sprint suppression.

// "block" = over a hard cap, needs a decision; "warn" = likely mis-set, worth a look;
// "info" = informational density signal (busy week), not individually actionable.
export type GuardrailSeverity = "info" | "warn" | "block";

export interface Guardrail {
  kind: "stage_cap" | "loop_cap" | "promo_density" | "reach_tier";
  severity: GuardrailSeverity;
  message: string;
  whenISO?: string; // YYYY-MM-DD of the affected service/window (church-local)
  channelKey?: string;
  requestIds?: string[];
  /** The involved events, id + title, so links can be labelled by event name. */
  requests?: { id: string; title: string }[];
}

/** One service-instance (e.g. a Sunday) for a capacity-capped channel. */
export interface InstanceLoad {
  channelKey: string;
  whenISO: string;
  capacity: number;
  requestIds: string[];
  titles: string[];
}

/**
 * Capacity cap: any instance whose number of requests exceeds the channel's
 * capacity is a hard `block`. The `loop` channel reports as `loop_cap`; every
 * other capacity-capped channel (stage / announcement video) reports as
 * `stage_cap`.
 */
export function evaluateCapacity(loads: InstanceLoad[]): Guardrail[] {
  const out: Guardrail[] = [];
  for (const load of loads) {
    if (load.requestIds.length <= load.capacity) continue;
    const kind = load.channelKey === "loop" ? "loop_cap" : "stage_cap";
    const over = load.requestIds.length;
    out.push({
      kind,
      severity: "block",
      message:
        `${over} events are scheduled on this output for ${load.whenISO}, ` +
        `but only ${load.capacity} fit — pick which ${load.capacity} to keep.`,
      whenISO: load.whenISO,
      channelKey: load.channelKey,
      requestIds: load.requestIds,
      requests: load.requestIds.map((id, i) => ({ id, title: load.titles[i] ?? "Event" })),
    });
  }
  return out;
}

/** Promo density per channel per ISO-week. */
export interface ChannelWeekLoad {
  channelKey: string;
  weekISO: string;
  touchCount: number;
  cap: number;
}

/**
 * Promo density (the "1-in-5" signal): when a channel carries more touches in a
 * single week than its cap, surface it as `info` — a busy-week heads-up, not an
 * alarm. It's not individually actionable (you can't "fix" a number), so it
 * stays out of the alert count and lives in a separate informational list.
 */
export function evaluatePromoDensity(loads: ChannelWeekLoad[]): Guardrail[] {
  const out: Guardrail[] = [];
  for (const load of loads) {
    if (load.touchCount <= load.cap) continue;
    out.push({
      kind: "promo_density",
      severity: "info",
      message:
        `${load.touchCount} posts scheduled this week — more than the usual ${load.cap}.`,
      whenISO: load.weekISO,
      channelKey: load.channelKey,
    });
  }
  return out;
}

/** Reach vs tier: a tier-1 (church-wide) request whose reach% is below threshold. */
export interface ReachCheck {
  requestId: string;
  title: string;
  tier: number;
  reachPct: number | null;
}

/**
 * Reach/tier check: a church-wide (tier 1) request that is only expected to
 * reach a small slice of the church is probably mis-tiered. `warn` only.
 */
export function evaluateReachTier(
  checks: ReachCheck[],
  thresholdPct: number
): Guardrail[] {
  const out: Guardrail[] = [];
  for (const c of checks) {
    if (c.tier !== 1) continue;
    if (c.reachPct == null) continue;
    if (c.reachPct >= thresholdPct) continue;
    out.push({
      kind: "reach_tier",
      severity: "warn",
      message:
        `"${c.title}" is church-wide (tier 1) but only reaches ` +
        `${c.reachPct}% — under the ${thresholdPct}% threshold`,
      requestIds: [c.requestId],
      requests: [{ id: c.requestId, title: c.title }],
    });
  }
  return out;
}
