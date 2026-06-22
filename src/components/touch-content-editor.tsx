"use client";
import { useState, useTransition } from "react";
import { updateTouch } from "@/actions/touch";

const fmtDate = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

export type TouchContentEditorProps = {
  id: string;
  scheduledAt: Date;
  channelName: string;
  content: string | null;
  assetLink: string | null;
  note: string | null;
  /**
   * When true the editor starts collapsed behind a small "✎ content"
   * affordance (used in the busy promotion timeline). When false it renders
   * inline-expanded (used under each live-this-week output item).
   */
  collapsible?: boolean;
};

/**
 * Per-week content editor for a single Touch. Lets you give THIS appearance its
 * own slide copy, graphic link, and production note — so e.g. the Jun 7 loop
 * slide can read differently than Jun 14. Optimistic-ish via useTransition.
 */
export function TouchContentEditor({
  id,
  scheduledAt,
  channelName,
  content,
  assetLink,
  note,
  collapsible = false,
}: TouchContentEditorProps) {
  const [open, setOpen] = useState(!collapsible);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [contentValue, setContentValue] = useState(content ?? "");
  const [assetValue, setAssetValue] = useState(assetLink ?? "");
  const [noteValue, setNoteValue] = useState(note ?? "");

  const hasContent = Boolean(content || assetLink || note);

  if (collapsible && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-sky-700 hover:underline"
        aria-expanded={false}
      >
        ✎ {hasContent ? "Wording added ●" : "Add wording"}
      </button>
    );
  }

  function onSave() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("content", contentValue);
    fd.set("assetLink", assetValue);
    fd.set("note", noteValue);
    startTransition(async () => {
      try {
        await updateTouch(id, fd);
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  return (
    <div className="mt-2 rounded-2xl border border-slate-100 bg-sky-bg/40 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-muted">
          {channelName} · {fmtDate(scheduledAt)}
        </span>
        {collapsible && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-muted hover:underline"
            aria-expanded
          >
            Collapse
          </button>
        )}
      </div>

      <label className="block text-xs font-semibold text-muted mb-1">
        Content
      </label>
      <textarea
        value={contentValue}
        onChange={(e) => {
          setContentValue(e.target.value);
          setSaved(false);
        }}
        placeholder="This week's slide / copy. Leave blank to use the event default."
        rows={3}
        className="w-full rounded-2xl border px-3 py-2 text-sm resize-y"
      />

      <label className="block text-xs font-semibold text-muted mb-1 mt-3">
        Asset link
      </label>
      <div className="flex items-center gap-2">
        <input
          value={assetValue}
          onChange={(e) => {
            setAssetValue(e.target.value);
            setSaved(false);
          }}
          placeholder="https://canva.com/… or Drive URL"
          className="flex-1 rounded-2xl border px-3 py-1.5 text-sm"
        />
        {assetLink && (
          <a
            href={assetLink}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs font-semibold text-sky-700 hover:underline"
          >
            ↗ open
          </a>
        )}
      </div>

      <label className="block text-xs font-semibold text-muted mb-1 mt-3">
        Note
      </label>
      <input
        value={noteValue}
        onChange={(e) => {
          setNoteValue(e.target.value);
          setSaved(false);
        }}
        placeholder="Production note for this appearance (optional)"
        className="w-full rounded-2xl border px-3 py-1.5 text-sm"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={onSave}
          className="rounded-full bg-emerald-600 text-white px-4 py-1 text-sm font-semibold disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && !pending && (
          <span className="text-xs font-semibold text-emerald-600">Saved ✓</span>
        )}
        {error && <span className="text-xs font-semibold text-rose-600">{error}</span>}
      </div>
    </div>
  );
}
