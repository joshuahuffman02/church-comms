"use client";
import { useState } from "react";

/**
 * Copy-to-clipboard button for the Downloads previews — copy/paste into the
 * bulletin, Canva, or an email is the real workflow, so it sits beside Download.
 */
export function CopyButton({ text, accent }: { text: string; accent: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard can be blocked (e.g. insecure context) — fail quietly;
          // Download is always available as the fallback.
        }
      }}
      className="shrink-0 rounded-2xl border px-4 py-2 text-sm font-semibold transition hover:bg-sky-bg"
      style={{ borderColor: `${accent}66`, color: accent }}
    >
      {copied ? "✓ Copied" : "📋 Copy"}
    </button>
  );
}
