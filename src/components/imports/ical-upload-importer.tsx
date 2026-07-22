"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, useTransition } from "react";
import {
  importUploadedIcalEvents,
  linkUploadedIcalEvent,
  previewIcalUpload,
  type IcalUploadPreviewResult,
} from "@/actions/ical-import";

const emptyPreview: IcalUploadPreviewResult | null = null;

export function IcalUploadImporter() {
  const [preview, setPreview] = useState<IcalUploadPreviewResult | null>(emptyPreview);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("review");
  const [noise, setNoise] = useState("likely");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const rows = useMemo(
    () => (preview?.ok ? preview.rows.filter((row) => !handled.has(row.event.key)) : []),
    [handled, preview],
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const queryMatch = !needle || row.event.title.toLowerCase().includes(needle) || (row.event.location ?? "").toLowerCase().includes(needle);
      const statusMatch = status === "all" || (status === "review" && row.status !== "already_in_system") || row.status === status;
      const noiseMatch = noise === "all" || (noise === "likely" && !row.event.operationalNoise) || (noise === "noise" && row.event.operationalNoise);
      return queryMatch && statusMatch && noiseMatch;
    });
  }, [noise, query, rows, status]);

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setMessage(null);
    startTransition(async () => {
      const result = await previewIcalUpload(formData);
      setPreview(result);
      setSelected(new Set());
      setHandled(new Set());
      if (!result.ok) setMessage(result.message);
    });
  }

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function importSelected() {
    if (!preview?.ok || selected.size === 0) return;
    const chosen = preview.rows.filter((row) => selected.has(row.event.key)).map((row) => row.event);
    const chosenKeys = new Set(chosen.map((event) => event.key));
    setConfirming(false);
    setMessage(null);
    startTransition(async () => {
      const result = await importUploadedIcalEvents(chosen);
      setHandled((current) => new Set([...current, ...chosenKeys]));
      setSelected(new Set());
      setMessage(`${result.created} imported${result.skipped ? ` · ${result.skipped} already handled` : ""}.`);
    });
  }

  function linkToExisting(key: string, requestId: string) {
    if (!preview?.ok) return;
    const row = preview.rows.find((candidate) => candidate.event.key === key);
    if (!row) return;
    setMessage(null);
    startTransition(async () => {
      const result = await linkUploadedIcalEvent(row.event, requestId);
      if (result.linked) {
        setHandled((current) => new Set([...current, key]));
        setSelected((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
        setMessage("Linked to the existing event; no duplicate was created.");
      }
    });
  }

  return (
    <div>
      <form onSubmit={upload} className="card-float mb-5 grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="grid gap-1.5">
          <span className="font-bold text-ink">Choose a calendar export</span>
          <span className="text-xs text-muted">.ics files up to 2 MB · previews the next 12 months · the file is not stored</span>
          <input
            name="calendarFile"
            type="file"
            accept=".ics,text/calendar"
            required
            disabled={pending}
            className="rounded-2xl border bg-white px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-sky-bg file:px-3 file:py-1.5 file:font-semibold file:text-sky-800"
          />
        </label>
        <button type="submit" disabled={pending} className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
          {pending ? "Reading file…" : "Preview events"}
        </button>
      </form>

      {message && (
        <div aria-live="polite" className={`mb-4 flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ${preview?.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          <span>{message}</span>
          {preview?.ok && <Link href="/requests" className="underline">View events →</Link>}
        </div>
      )}

      {preview?.ok && (
        <div>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-extrabold text-ink">Previewing {preview.fileName}</h3>
              <p className="text-sm text-muted">Only selected rows will be imported. Existing events are never overwritten.</p>
            </div>
            <div className="flex gap-2 text-xs font-bold text-muted">
              <span className="rounded-full bg-white px-3 py-1.5">{rows.length} remaining</span>
              <span className="rounded-full bg-rose-50 px-3 py-1.5 text-rose-700">{rows.filter((row) => row.status === "possible_match").length} possible duplicates</span>
            </div>
          </div>

          <div className="card-float mb-3 grid gap-3 p-3 lg:grid-cols-[1fr_auto]">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <label>
                <span className="sr-only">Search uploaded events</span>
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or location" className="w-full rounded-full border px-4 py-2 text-sm" />
              </label>
              <label>
                <span className="sr-only">Filter by review status</span>
                <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full rounded-full border px-4 py-2 text-sm">
                  <option value="review">Needs review</option>
                  <option value="missing">New only</option>
                  <option value="possible_match">Possible duplicates</option>
                  <option value="already_in_system">Already in app</option>
                  <option value="all">All</option>
                </select>
              </label>
              <label>
                <span className="sr-only">Filter operational calendar items</span>
                <select value={noise} onChange={(event) => setNoise(event.target.value)} className="w-full rounded-full border px-4 py-2 text-sm">
                  <option value="likely">Likely events</option>
                  <option value="all">Include operational items</option>
                  <option value="noise">Operational only</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setSelected(new Set(visible.filter((row) => row.status !== "already_in_system").map((row) => row.event.key)))} disabled={pending || visible.length === 0} className="rounded-full border px-3 py-1.5 text-sm font-semibold text-muted disabled:opacity-40">Select visible</button>
              <button type="button" onClick={() => setSelected(new Set())} disabled={pending || selected.size === 0} className="rounded-full border px-3 py-1.5 text-sm font-semibold text-muted disabled:opacity-40">Clear</button>
              <button type="button" onClick={() => setConfirming(true)} disabled={pending || selected.size === 0} className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">Import selected ({selected.size})</button>
            </div>
          </div>

          <div className="card-float overflow-hidden">
            {visible.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted">No events match these filters.</div>
            ) : visible.map((row) => {
              const disabled = row.status === "already_in_system";
              return (
                <article key={row.event.key} className={`border-t border-slate-100 px-4 py-4 first:border-t-0 sm:px-5 ${disabled ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={selected.has(row.event.key)} onChange={() => toggle(row.event.key)} disabled={pending || disabled} aria-label={`Select ${row.event.title}`} className="mt-1 h-4 w-4" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold text-ink">{row.event.title}</h4>
                        <FileStatus status={row.status} />
                        {row.event.operationalNoise && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-muted">Operational</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                        <span>{formatDate(row.event.startsAtMs)}</span>
                        {row.event.location && <span>{row.event.location}</span>}
                      </div>
                      {row.matches.map((match) => (
                        <div key={match.id} className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-muted">
                          <span className="min-w-0 flex-1">Possible match: <Link href={`/requests/${match.id}`} className="font-bold text-ink underline">{match.title}</Link> · {formatDate(match.eventStartMs)} · {match.reason}</span>
                          {row.status === "possible_match" && <button type="button" onClick={() => linkToExisting(row.event.key, match.id)} disabled={pending} className="rounded-full border border-amber-300 bg-white px-3 py-1 font-bold text-amber-800 disabled:opacity-40">Use existing</button>}
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {confirming && preview?.ok && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/25 p-4" role="dialog" aria-modal="true" aria-labelledby="file-import-confirm-title">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 id="file-import-confirm-title" className="text-lg font-extrabold text-ink">Import selected file events?</h2>
            <p className="mt-2 text-sm text-muted">
              {selected.size} selected {selected.size === 1 ? "event will be created as a submitted event" : "events will be created as submitted events"}.
              {preview.rows.filter((row) => selected.has(row.event.key) && row.status === "possible_match").length > 0 && " Your selection includes possible duplicates; compare them before continuing."}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="rounded-full border px-4 py-2 text-sm font-semibold text-muted">Cancel</button>
              <button type="button" onClick={importSelected} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">Import {selected.size}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FileStatus({ status }: { status: "missing" | "possible_match" | "already_in_system" }) {
  const styles = status === "missing" ? "bg-violet-100 text-violet-700" : status === "possible_match" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700";
  const label = status === "missing" ? "New" : status === "possible_match" ? "Possible duplicate" : "Already in app";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${styles}`}>{label}</span>;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
