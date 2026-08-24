"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, FileText, Search, Sparkles, X } from "lucide-react";

export type CommandPaletteItem = {
  href: string;
  label: string;
  detail?: string;
  kind: "page" | "event" | "channel";
  keywords?: string;
};

const KIND_LABEL: Record<CommandPaletteItem["kind"], string> = {
  page: "Page",
  event: "Event",
  channel: "Channel",
};

function ItemIcon({ kind }: { kind: CommandPaletteItem["kind"] }) {
  if (kind === "event") return <CalendarDays className="h-4 w-4" aria-hidden />;
  if (kind === "channel") return <Sparkles className="h-4 w-4" aria-hidden />;
  return <FileText className="h-4 w-4" aria-hidden />;
}

/**
 * A small global finder for routes, active channels, and recent events. It is
 * intentionally navigation-only: opening an item never mutates product data.
 */
export function CommandPalette({ items }: { items: CommandPaletteItem[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
        setQuery("");
      }
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    const onExternalOpen = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("comms:open-search", onExternalOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("comms:open-search", onExternalOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items.slice(0, 10);
    return items
      .filter((item) =>
        [item.label, item.detail, item.keywords, KIND_LABEL[item.kind]]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle),
      )
      .slice(0, 12);
  }, [items, query]);

  const dialog = open ? (
    <div className="fixed inset-0 z-[100] grid place-items-start overflow-y-auto px-4 py-[10vh]" role="presentation">
      <button
        type="button"
        aria-label="Close search"
        className="fixed inset-0 bg-slate-950/25 backdrop-blur-sm"
        onClick={close}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-heading"
        className="card-float relative mx-auto w-full max-w-2xl overflow-hidden bg-white/95 shadow-2xl"
      >
        <h2 id="command-palette-heading" className="sr-only">Find a page or event</h2>
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <Search className="h-5 w-5 shrink-0 text-sky-700" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a page, event, or channel…"
            aria-label="Find a page, event, or channel"
            className="min-h-11 flex-1 border-0 bg-transparent px-1 text-base shadow-none outline-none focus:shadow-none"
          />
          <button
            type="button"
            onClick={close}
            aria-label="Close search"
            className="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-sky-bg"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="max-h-[62vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-extrabold text-ink">No matching place or event</p>
              <p className="mt-1 text-sm text-muted">Try a shorter title, channel, or page name.</p>
            </div>
          ) : (
            <div className="grid gap-1">
              {results.map((item) => (
                <Link
                  key={`${item.kind}-${item.href}`}
                  href={item.href}
                  onClick={close}
                  className="group flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-sky-bg"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-600 group-hover:bg-white group-hover:text-sky-700">
                    <ItemIcon kind={item.kind} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-ink">{item.label}</span>
                    <span className="block truncate text-xs text-muted">
                      {item.detail ?? KIND_LABEL[item.kind]}
                    </span>
                  </span>
                  <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted">
                    {KIND_LABEL[item.kind]}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/75 px-4 py-2 text-xs text-muted">
          <span>Search stays on this device.</span>
          <span><kbd className="rounded border bg-white px-1.5 py-0.5 font-bold text-ink">Esc</kbd> closes</span>
        </div>
      </section>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="nav-link mb-1 hidden min-h-11 w-full items-center gap-2.5 rounded-2xl border border-slate-100 px-3 py-2 text-left text-sm font-semibold text-muted lg:flex"
      >
        <Search className="h-4 w-4" aria-hidden />
        <span>Find anything</span>
        <kbd className="ml-auto rounded border bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500">⌘ K</kbd>
      </button>
      {dialog && typeof document !== "undefined" ? createPortal(dialog, document.body) : null}
    </>
  );
}
