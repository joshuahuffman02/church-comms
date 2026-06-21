"use client";

/**
 * Tiny client component that triggers the browser print dialog. Marked
 * `.no-print` so it disappears from the printed page itself. Used on the
 * run-sheet so the front office can print the week to paper.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print shrink-0 rounded-full px-4 py-2 text-sm font-semibold btn-primary"
      title="Print this run-sheet"
    >
      🖨️ Print
    </button>
  );
}
