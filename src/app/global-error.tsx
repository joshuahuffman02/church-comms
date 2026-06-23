"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

/**
 * Last-resort boundary for errors thrown by the root layout itself. It replaces
 * the whole document, so it ships its own <html>/<body> and inline styles rather
 * than relying on the app shell (which is what failed).
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          background: "linear-gradient(180deg, #f3f7ff 0%, #eef3fc 45%, #f4fbf7 100%)",
          color: "#253449",
        }}
      >
        <div
          style={{
            maxWidth: 420,
            textAlign: "center",
            background: "rgba(255,255,255,0.8)",
            borderRadius: 24,
            padding: "2rem",
            boxShadow: "0 24px 48px -24px rgba(56,189,248,0.3)",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 8 }}>☁️</div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Something went wrong</h1>
          <p style={{ color: "#64748b", fontSize: 14, marginTop: 8 }}>
            The app hit an unexpected snag — nothing was lost. Try again, and let your tech
            helper know if it keeps happening.
          </p>
          <button
            onClick={() => unstable_retry()}
            style={{
              marginTop: 20,
              border: "none",
              borderRadius: 9999,
              padding: "0.6rem 1.4rem",
              fontSize: 14,
              fontWeight: 600,
              color: "#fff",
              cursor: "pointer",
              backgroundImage: "linear-gradient(135deg, #93c5fd 0%, #a78bfa 55%, #c4b5fd 100%)",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
