"use client";
import { useMemo, useState, useTransition } from "react";
import { linkPcoEvent } from "@/actions/pco-link";

export type PcoLinkRow = {
  pcoEventId: string;
  name: string;
  startsAtMs: number;
  rooms: string[];
  needsRegistration: boolean;
};

const fmt = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/**
 * Searchable, scrollable list of candidate (unlinked) approved PCO events. Each
 * row's "Link this" button posts the chosen pcoEventId to `linkPcoEvent` for the
 * given request via a transition; the action redirects on success.
 */
export function PcoLinkList({
  requestId,
  events,
}: {
  requestId: string;
  events: PcoLinkRow[];
}) {
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.rooms.some((r) => r.toLowerCase().includes(q)),
    );
  }, [events, query]);

  function link(pcoEventId: string) {
    setLinkingId(pcoEventId);
    const fd = new FormData();
    fd.set("pcoEventId", pcoEventId);
    startTransition(() => linkPcoEvent(requestId, fd));
  }

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search Planning Center events…"
        className="w-full rounded-2xl border px-4 py-2 text-sm mb-4"
      />

      <div className="card-float overflow-hidden">
        <div className="px-5 py-3 text-xs font-bold text-muted border-b border-slate-100">
          Unlinked approved Planning Center events
        </div>

        {events.length === 0 && (
          <div className="px-5 py-6 text-muted text-sm">
            No unlinked approved events found in Planning Center. Every approved
            event is already linked to a request.
          </div>
        )}

        {events.length > 0 && filtered.length === 0 && (
          <div className="px-5 py-6 text-muted text-sm">
            No events match &ldquo;{query}&rdquo;.
          </div>
        )}

        <div className="max-h-[28rem] overflow-y-auto">
          {filtered.map((e) => {
            const isLinking = pending && linkingId === e.pcoEventId;
            return (
              <div
                key={e.pcoEventId}
                className="flex items-start gap-3 px-5 py-3 border-t border-slate-100 text-sm first:border-t-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-semibold">{e.name}</span>
                    <span className="text-muted">{fmt(e.startsAtMs)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted mt-0.5">
                    <span>
                      {e.rooms.length > 0
                        ? `📍 ${e.rooms.join(", ")}`
                        : "📍 No room booked"}
                    </span>
                    {e.needsRegistration && <span>🎟️ Registration</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => link(e.pcoEventId)}
                  disabled={pending}
                  className="shrink-0 rounded-full bg-ink text-white px-4 py-1.5 text-xs font-semibold disabled:opacity-40"
                >
                  {isLinking ? "Linking…" : "Link this"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
