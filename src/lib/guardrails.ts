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
  channelName?: string;
  requestIds?: string[];
  /** The involved events, id + title, so links can be labelled by event name. */
  requests?: { id: string; title: string }[];
  /** Structured capacity data for decision-focused UIs. */
  itemCount?: number;
  capacity?: number;
  pickedCount?: number;
  pickedRequestIds?: string[];
}

/** One service-instance (e.g. a Sunday) for a capacity-capped channel. */
export interface InstanceLoad {
  channelKey: string;
  channelName?: string;
  whenISO: string;
  capacity: number;
  requestIds: string[];
  titles: string[];
  /**
   * How many of this instance's slots are already CURATED (the announcement-
   * video Top-3 picks for this Sunday). When the picks fill the capacity, the
   * over-cap is a decision already made — it downgrades from an actionable
   * `block` to an informational `info` instead of nagging forever.
   */
  pickedCount?: number;
  pickedRequestIds?: string[];
}

/**
 * Capacity cap: any instance whose number of requests exceeds the channel's
 * capacity needs a decision (`block`) — UNLESS that many slots are already
 * picked, in which case it's a resolved, informational heads-up (`info`). The
 * `loop` channel reports as `loop_cap`; every other capacity-capped channel
 * (stage / announcement video) reports as `stage_cap`.
 */
export function evaluateCapacity(loads: InstanceLoad[]): Guardrail[] {
  const out: Guardrail[] = [];
  for (const load of loads) {
    if (load.requestIds.length <= load.capacity) continue;
    const kind = load.channelKey === "loop" ? "loop_cap" : "stage_cap";
    const over = load.requestIds.length;
    const resolved = (load.pickedCount ?? 0) >= load.capacity;
    out.push({
      kind,
      severity: resolved ? "info" : "block",
      message: resolved
        ? `${over} events want this output for ${load.whenISO} — your ${load.capacity} are featured; ` +
          `the rest are held.`
        : `${over} events are scheduled on this output for ${load.whenISO}, ` +
          `but only ${load.capacity} fit — pick which ${load.capacity} to keep.`,
      whenISO: load.whenISO,
      channelKey: load.channelKey,
      channelName: load.channelName,
      requestIds: load.requestIds,
      requests: load.requestIds.map((id, i) => ({ id, title: load.titles[i] ?? "Event" })),
      itemCount: over,
      capacity: load.capacity,
      pickedCount: load.pickedCount ?? 0,
      pickedRequestIds: load.pickedRequestIds ?? [],
    });
  }
  return out;
}

export type GuardrailOverview = {
  dueSoon: Guardrail[];
  later: Guardrail[];
  info: Guardrail[];
  summary: {
    actionableCount: number;
    dueSoonCount: number;
    laterCount: number;
    infoCount: number;
    nextDecisionISO: string | null;
  };
};

function guardrailDayMs(iso: string | undefined): number | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
}

/**
 * Split actionable checks into a short decision horizon and a collapsed later
 * queue. Date-less warnings (for example reach/tier mismatches) belong in the
 * immediate queue because they can be resolved at any time.
 */
export function buildGuardrailOverview(
  guardrails: Guardrail[],
  today: Date,
  focusDays = 30,
): GuardrailOverview {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const focusEnd = start + focusDays * 86_400_000;
  const actionable = guardrails.filter((guardrail) => guardrail.severity !== "info");
  const info = guardrails.filter((guardrail) => guardrail.severity === "info");
  const severityWeight: Record<GuardrailSeverity, number> = { block: 0, warn: 1, info: 2 };
  const sortChecks = (a: Guardrail, b: Guardrail) => {
    const severity = severityWeight[a.severity] - severityWeight[b.severity];
    if (severity !== 0) return severity;
    const aDay = guardrailDayMs(a.whenISO);
    const bDay = guardrailDayMs(b.whenISO);
    if (aDay == null && bDay != null) return -1;
    if (aDay != null && bDay == null) return 1;
    return (aDay ?? 0) - (bDay ?? 0);
  };
  const dueSoon = actionable
    .filter((guardrail) => {
      const day = guardrailDayMs(guardrail.whenISO);
      return day == null || day <= focusEnd;
    })
    .sort(sortChecks);
  const later = actionable
    .filter((guardrail) => {
      const day = guardrailDayMs(guardrail.whenISO);
      return day != null && day > focusEnd;
    })
    .sort(sortChecks);
  const dated = actionable
    .flatMap((guardrail) => guardrail.whenISO ? [guardrail.whenISO] : [])
    .sort();
  return {
    dueSoon,
    later,
    info: info.sort(sortChecks),
    summary: {
      actionableCount: actionable.length,
      dueSoonCount: dueSoon.length,
      laterCount: later.length,
      infoCount: info.length,
      nextDecisionISO: dated[0] ?? null,
    },
  };
}

/** Promo density per channel per ISO-week. */
export interface ChannelWeekLoad {
  channelKey: string;
  channelName?: string;
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
      channelName: load.channelName,
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
