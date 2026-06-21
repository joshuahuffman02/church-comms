"use client";
import { useState, useTransition } from "react";
import { setDeliverableAssetLink } from "@/actions/tasks";

/**
 * The main art link for a single channel deliverable (Deliverable.assetLink).
 * Collapsed it shows "🎨 art" (with an "↗ open" when a link is set); expanded
 * it's a tiny URL field that saves to `setDeliverableAssetLink`.
 */
export function DeliverableArtLink({
  deliverableId,
  assetLink,
}: {
  deliverableId: string;
  assetLink: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(assetLink ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-semibold text-sky-700 hover:underline"
          title={assetLink ? "Edit art link" : "Add art link"}
        >
          🎨 art{assetLink ? " ●" : ""}
        </button>
        {assetLink && (
          <a
            href={assetLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-sky-700 hover:underline"
          >
            ↗ open
          </a>
        )}
      </span>
    );
  }

  const save = () => {
    const trimmed = value.trim();
    if (trimmed !== "" && !/^https?:\/\//i.test(trimmed)) {
      setError("Must start with http:// or https://");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("assetLink", trimmed);
    start(() => {
      setDeliverableAssetLink(deliverableId, fd).then(() => setOpen(false));
    });
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="url"
        value={value}
        autoFocus
        placeholder="https://canva.com/…"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setOpen(false);
        }}
        className="w-48 rounded-full border px-3 py-1 text-xs"
      />
      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-muted hover:underline"
      >
        cancel
      </button>
      {error && <span className="text-xs text-rose-500">{error}</span>}
    </span>
  );
}
