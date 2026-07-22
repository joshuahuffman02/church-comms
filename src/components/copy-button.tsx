"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Copy-to-clipboard button for the Downloads previews — copy/paste into the
 * bulletin, Canva, or an email is the real workflow, so it sits beside Download.
 */
export function CopyButton({
  text,
  accent,
  label = "Copy",
  disabled = false,
}: {
  text: string;
  accent: string;
  label?: string;
  disabled?: boolean;
}) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const subject = label.replace(/^Copy\s+/i, "");

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Clipboard API access is commonly blocked on a local-network HTTP URL.
      // Keep copy useful there with the browser's synchronous selection fallback.
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) throw new Error("Copy was blocked");
    }
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={disabled}
        onClick={async () => {
          try {
            await copyText();
            setState("copied");
            window.setTimeout(() => setState("idle"), 1600);
          } catch {
            setState("error");
            window.setTimeout(() => setState("idle"), 2400);
          }
        }}
        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition hover:bg-sky-bg disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
        style={disabled ? undefined : { borderColor: `${accent}66`, color: accent }}
      >
        {state === "copied" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        {state === "copied" ? "Copied" : state === "error" ? "Copy failed" : label}
      </button>
      <span className="sr-only" aria-live="polite">
        {state === "copied" ? `${subject} copied to the clipboard` : state === "error" ? `Could not copy ${subject}` : ""}
      </span>
    </span>
  );
}
