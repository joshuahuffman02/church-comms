import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  planningCenterAuthEnabled,
} from "@/lib/pco-auth";

function safeCallbackUrl(raw: FormDataEntryValue | string | undefined | null): string {
  if (typeof raw !== "string" || raw.trim() === "") return "/this-week";
  try {
    const path = raw.startsWith("/") && !raw.startsWith("//")
      ? raw
      : `${new URL(raw).pathname}${new URL(raw).search}${new URL(raw).hash}`;
    if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/login")) {
      return "/this-week";
    }
    return path;
  } catch {
    return "/this-week";
  }
}

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;
  const redirectTo = safeCallbackUrl(callbackUrl);
  const oauthError =
    error && error !== "1" && error !== "CredentialsSignin";
  return (
    <div className="min-h-screen grid place-items-center px-4 py-10">
      <div className="grid w-full max-w-5xl gap-5 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start">
        <div className="card-float p-9 grid gap-4">
          <div className="text-center mb-1">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-3xl bg-gradient-to-br from-sky-200 to-violet-200 text-3xl shadow-sm">
              ☁️
            </div>
            <h1 className="text-2xl font-extrabold">Welcome</h1>
            <p className="text-muted text-sm mt-1">Sign in to church communications</p>
          </div>

          {oauthError && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-2xl px-3 py-2 text-center">
              {error === "AccessDenied"
                ? "This Planning Center account is not active for this church."
                : "Planning Center sign-in could not be completed. Please try again."}
            </p>
          )}

          {planningCenterAuthEnabled ? (
            <form
              action={async (fd: FormData) => {
                "use server";
                const redirectTo = safeCallbackUrl(fd.get("callbackUrl"));
                await signIn("planning-center", { redirectTo });
              }}
            >
              <input type="hidden" name="callbackUrl" value={redirectTo === "/this-week" ? "/my-requests" : redirectTo} />
              <button className="btn-primary w-full rounded-full px-5 py-3 font-extrabold">
                Continue with Planning Center
              </button>
              <p className="mt-2 text-center text-xs text-muted">
                Staff profiles are created automatically on first sign-in.
              </p>
            </form>
          ) : (
            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-sky-950">
              <p className="font-bold">Communications team login is ready.</p>
              <p className="mt-1 text-xs text-sky-900/80">
                Planning Center sign-in is optional and can be connected later by an admin.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-muted">
            <span className="h-px flex-1 bg-slate-200" />
            Communications team login
            <span className="h-px flex-1 bg-slate-200" />
          </div>

        <form action={async (fd: FormData) => { "use server";
          const redirectTo = safeCallbackUrl(fd.get("callbackUrl"));
          try {
            await signIn("credentials", { email: fd.get("email"), password: fd.get("password"), redirectTo });
          } catch (error) {
            if (error instanceof AuthError) {
              redirect(`/login?error=1&callbackUrl=${encodeURIComponent(redirectTo)}`);
            }
            throw error; // re-throw Next's redirect
          }
        }} className="grid gap-4">
          {(error === "1" || error === "CredentialsSignin") && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-2xl px-3 py-2 text-center">
              Invalid email or password.
            </p>
          )}
          <input type="hidden" name="callbackUrl" value={redirectTo} />
          <label className="grid gap-1 text-sm font-semibold text-muted">
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="Email"
              className="rounded-full border px-4 py-2.5 font-normal text-ink"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-muted">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="Password"
              className="rounded-full border px-4 py-2.5 font-normal text-ink"
            />
          </label>
          <button className="rounded-full bg-ink text-white py-2.5 font-bold mt-1">Sign in</button>
        </form>
        </div>

        <section className="card-float p-7 text-sm leading-relaxed text-muted">
          <p className="text-xs font-extrabold uppercase tracking-wide text-sky-700">For church staff</p>
          <h2 className="mt-2 text-xl font-extrabold text-ink">
            Every request stays easy to find.
          </h2>
          <ul className="mt-4 grid gap-3">
            <li className="rounded-2xl border bg-white/55 p-4"><b className="text-ink">Track every request</b><br />See upcoming, past, active, and completed requests in one place.</li>
            <li className="rounded-2xl border bg-white/55 p-4"><b className="text-ink">See the advertising plan</b><br />Know which channels are planned and the dates each placement will run.</li>
            <li className="rounded-2xl border bg-white/55 p-4"><b className="text-ink">Improve the details</b><br />Update public descriptions, registration information, location, audience, and the next step.</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/submit" className="btn-primary inline-flex min-h-11 items-center rounded-full px-4 py-2 text-sm font-bold">
              Submit a request
            </Link>
            <Link href="/my-requests" className="inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-bold text-sky-700 hover:bg-sky-bg">
              Track my requests
            </Link>
          </div>
          <p className="mt-4 text-xs">
            {planningCenterAuthEnabled
              ? "Planning Center verifies staff identities, and this Mac stores only the local profile needed to connect requests."
              : "Use the communications team account above. Planning Center sign-in can be added later without changing your local request history."}
          </p>
        </section>
      </div>
    </div>
  );
}
