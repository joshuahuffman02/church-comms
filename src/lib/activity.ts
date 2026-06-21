import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";

type ActivityInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

type RequestActivityInput = Omit<ActivityInput, "entityType" | "entityId"> & {
  requestId: string;
};

export async function logActivity(
  input: ActivityInput,
  actor?: SessionUser | null,
): Promise<void> {
  await db.activityLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary ?? null,
      metadata: input.metadata ?? undefined,
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      actorName: actor?.name ?? null,
    },
  });
}

export async function logRequestActivity(
  input: RequestActivityInput,
  actor?: SessionUser | null,
): Promise<void> {
  await logActivity(
    {
      action: input.action,
      entityType: "request",
      entityId: input.requestId,
      summary: input.summary,
      metadata: input.metadata,
    },
    actor,
  );
}
