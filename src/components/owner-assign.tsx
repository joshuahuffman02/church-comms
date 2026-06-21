"use client";
import { useTransition } from "react";
import { assignRequestOwner } from "@/actions/tasks";

export type ActiveUser = { id: string; name: string };

/**
 * Request-level owner picker. A dropdown of active users → `assignRequestOwner`.
 * The empty option unassigns. The chosen owner becomes the default effective
 * owner for every deliverable that doesn't carry its own.
 */
export function OwnerAssign({
  requestId,
  ownerId,
  users,
}: {
  requestId: string;
  ownerId: string | null;
  users: ActiveUser[];
}) {
  const [pending, start] = useTransition();

  return (
    <select
      aria-label="Assign owner"
      title="Assign owner"
      value={ownerId ?? ""}
      disabled={pending}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("userId", e.target.value);
        start(() => assignRequestOwner(requestId, fd));
      }}
      className="rounded-full border px-3 py-1 text-xs font-semibold text-muted cursor-pointer hover:bg-sky-bg transition disabled:opacity-50"
    >
      <option value="">Unassigned</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );
}
