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
    <div className="min-h-screen grid place-items-center px-4 py-10">
      <div className="grid w-full max-w-5xl gap-5 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start">
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
        }} className="card-float p-9 grid gap-4">
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

        <section className="card-float p-7 text-sm leading-relaxed text-muted">
          <p className="text-xs font-extrabold uppercase tracking-wide text-sky-700">
            First time here?
          </p>
          <h2 className="mt-2 text-xl font-extrabold text-ink">
            Create your first admin account from the setup command.
          </h2>
          <p className="mt-3">
            This app is self-hosted, so it does not create public signups. The
            first admin is created when the installer seeds the database.
          </p>
          <ol className="mt-4 grid gap-3">
            <li>
              <span className="font-bold text-ink">1. Configure the app.</span>{" "}
              Copy <code className="font-mono">.env.example</code> to{" "}
              <code className="font-mono">.env</code> and set{" "}
              <code className="font-mono">AUTH_SECRET</code>.
            </li>
            <li>
              <span className="font-bold text-ink">2. Prepare the database.</span>{" "}
              Run <code className="font-mono">npm run prisma:generate</code> and{" "}
              <code className="font-mono">npm run db:prepare</code>.
            </li>
            <li>
              <span className="font-bold text-ink">3. Seed the first user.</span>{" "}
              Run{" "}
              <code className="font-mono">
                ADMIN_PASSWORD=&quot;your-password&quot; npx tsx prisma/seed.ts
              </code>
              .
            </li>
          </ol>
          <div className="mt-5 rounded-2xl border bg-sky-bg/50 p-4">
            <p className="font-bold text-ink">Then sign in with:</p>
            <p className="mt-1">
              Email: <code className="font-mono">admin@example.church</code>
            </p>
            <p>
              Password: the <code className="font-mono">ADMIN_PASSWORD</code>{" "}
              you used while seeding.
            </p>
          </div>
          <p className="mt-4">
            After you are in, go to <b className="text-ink">Settings - Team &amp; access</b>{" "}
            to add real users and set their passwords.
          </p>
          <p className="mt-4">
            Need the full walkthrough? Read the{" "}
            <a
              href="https://github.com/joshuahuffman02/church-comms#quickstart"
              className="font-semibold text-sky-700 underline"
            >
              GitHub quickstart
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
