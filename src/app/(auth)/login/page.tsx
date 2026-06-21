import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

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
  return (
    <div className="min-h-screen grid place-items-center">
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
      }} className="card-float p-9 w-[min(92vw,400px)] grid gap-4">
        <div className="text-center mb-1">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-3xl bg-gradient-to-br from-sky-200 to-violet-200 text-3xl shadow-sm">
            ☁️
          </div>
          <h1 className="text-2xl font-extrabold">Welcome back</h1>
          <p className="text-muted text-sm mt-1">Sign in to your comms board</p>
        </div>
        {error && (
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
  );
}
