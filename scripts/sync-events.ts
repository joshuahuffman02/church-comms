import "dotenv/config";

async function main(): Promise<void> {
  const secret = process.env.CRON_SECRET?.trim();
  const baseUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

  if (!secret) {
    throw new Error("CRON_SECRET is not configured; automatic event sync is disabled.");
  }

  const response = await fetch(`${baseUrl}/api/cron/sync-events`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Event sync failed (${response.status}): ${body.slice(0, 1_000)}`);
  }

  console.log(`${new Date().toISOString()} ${body}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
