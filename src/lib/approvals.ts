import { db } from "@/lib/db";

/**
 * An active ApprovalRule that matches a request but is not yet satisfied by an
 * `approved` Approval. `approval` is the most recent matching Approval row (if
 * any), so callers can see a pending decision without re-querying.
 */
export type UnmetRule = {
  rule: {
    id: string;
    name: string;
    conditionType: string;
    conditionValue: string | null;
    approverId: string | null;
  };
  approval?: { id: string; status: string };
};

type RequestForMatch = {
  tier: number;
  sensitiveFlag: boolean;
  deliverables: { channel: { key: string; type: string } }[];
};

/** Does this request satisfy the rule's condition (ignoring approval state)? */
function ruleMatches(
  conditionType: string,
  conditionValue: string | null,
  req: RequestForMatch
): boolean {
  const hasChannelKey = (key: string) =>
    req.deliverables.some((d) => d.channel.key === key);

  switch (conditionType) {
    case "tier1":
      return req.tier === 1;
    case "channel":
      return conditionValue != null && hasChannelKey(conditionValue);
    case "stage":
      return req.deliverables.some(
        (d) => d.channel.type === "dated_instance" && d.channel.key === "stage"
      );
    case "all_church_email":
      return (
        req.tier === 1 &&
        (hasChannelKey("dedicated_email") || hasChannelKey("newsletter"))
      );
    case "sensitive":
      return req.sensitiveFlag === true;
    default:
      return false;
  }
}

/**
 * Return the active ApprovalRules that MATCH this request AND are not yet
 * satisfied by an `approved` Approval (matched on ruleId). Each entry carries
 * the latest matching Approval (e.g. a pending one) when present.
 *
 * With no active rules this returns `[]` — approval is dormant by default
 * (solo-admin), so behavior is unchanged.
 */
export async function requestNeedsApproval(
  requestId: string
): Promise<UnmetRule[]> {
  const [request, rules] = await Promise.all([
    db.request.findUnique({
      where: { id: requestId },
      include: { deliverables: { include: { channel: true } } },
    }),
    db.approvalRule.findMany({ where: { active: true } }),
  ]);
  if (!request || rules.length === 0) return [];

  const approvals = await db.approval.findMany({ where: { requestId } });

  const unmet: UnmetRule[] = [];
  for (const rule of rules) {
    if (!ruleMatches(rule.conditionType, rule.conditionValue, request)) continue;

    const forRule = approvals.filter((a) => a.ruleId === rule.id);
    const satisfied = forRule.some((a) => a.status === "approved");
    if (satisfied) continue;

    // Surface the most recent matching approval (e.g. pending) for context.
    const latest = forRule
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    unmet.push({
      rule: {
        id: rule.id,
        name: rule.name,
        conditionType: rule.conditionType,
        conditionValue: rule.conditionValue,
        approverId: rule.approverId,
      },
      approval: latest ? { id: latest.id, status: latest.status } : undefined,
    });
  }
  return unmet;
}
