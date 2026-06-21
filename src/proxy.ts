import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Edge-safe Auth.js instance built from the base config only (no Prisma /
// bcrypt), so the proxy runs in the Edge runtime.
// NOTE: Next 16 renamed the `middleware` convention to `proxy`. With a `src/`
// directory this file MUST live at `src/proxy.ts`.
const { auth } = NextAuth(authConfig);

// Explicit default function export — Next's proxy loader resolves the handler
// as `mod.proxy || mod.default`, so a default export satisfies the convention.
// (The destructured-binding form works in dev but the build cannot analyze it.)
// Unauthenticated requests are redirected to /login.
export default auth((req) => {
  if (!req.auth && req.nextUrl.pathname !== "/login") {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", req.nextUrl.href);
    return Response.redirect(url);
  }
});

export const config = {
  // `api/cron` is excluded so the scheduled sync route is reachable without a
  // user session — it protects itself with CRON_SECRET instead.
  matcher: ["/((?!login|submit|status|api/auth|api/cron|_next|favicon.ico).*)"],
};
