"use client";
import { useState, useTransition } from "react";
import { attachAssetLink, removeAsset } from "@/actions/tasks";

export type AssetRow = {
  id: string;
  url: string;
  label: string | null;
  isFinal: boolean;
};

/**
 * "Assets / finished art" panel: lists a request's link assets (Canva/Drive/
 * finished art) and an add-link form. Links only — no file upload. Each asset
 * can be flagged isFinal (the deliverable-ready art).
 */
export function AssetAttach({
  requestId,
  assets,
  canEdit = true,
}: {
  requestId: string;
  assets: AssetRow[];
  canEdit?: boolean;
}) {
  const [pending, start] = useTransition();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [isFinal, setIsFinal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      setError("Link must start with http:// or https://");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("url", trimmed);
    fd.set("label", label.trim());
    if (isFinal) fd.set("isFinal", "on");
    start(() => {
      attachAssetLink(requestId, fd).then(() => {
        setUrl("");
        setLabel("");
        setIsFinal(false);
      });
    });
  };

  return (
    <div className="card-float p-5 mb-4">
      <h2 className="font-bold mb-3">🎨 Assets / finished art</h2>

      {assets.length === 0 ? (
        <p className="text-muted text-sm mb-3">
          No assets yet. Drop a Canva or Drive link to the artwork below.
        </p>
      ) : (
        <div className="grid gap-2 mb-3">
          {assets.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3 text-sm"
            >
              {a.isFinal && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  Final
                </span>
              )}
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-sky-700 hover:underline truncate"
                title={a.url}
              >
                {a.label || a.url}
              </a>
              <span className="text-muted text-xs truncate hidden sm:inline">
                {a.label ? a.url : ""}
              </span>
              {canEdit && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(() => removeAsset(a.id))}
                  className="ml-auto rounded-full border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition disabled:opacity-50"
                  title="Remove asset"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <input
          type="text"
          value={label}
          placeholder="Label (e.g. Lobby poster)"
          onChange={(e) => setLabel(e.target.value)}
          className="w-40 rounded-full border px-3 py-1.5 text-sm"
        />
        <input
          type="url"
          value={url}
          placeholder="https://canva.com/… or Drive link"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          className="min-w-48 flex-1 rounded-full border px-3 py-1.5 text-sm"
        />
        <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <input
            type="checkbox"
            checked={isFinal}
            onChange={(e) => setIsFinal(e.target.checked)}
          />
          Final
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={add}
          className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Add link
        </button>
      </div>
      )}
      {error && <p className="text-xs text-rose-500 mt-2">{error}</p>}
    </div>
  );
}
