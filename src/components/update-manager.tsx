"use client";

import { useMemo, useState, useTransition } from "react";

import {
  checkForUpdatesAction,
  runProductionUpdateAction,
} from "@/actions/updater";
import {
  shortSha,
  type ProductionUpdateResult,
  type UpdateStatus,
} from "@/lib/update-status";

const STATUS_LABELS: Record<UpdateStatus["state"], string> = {
  diverged: "Manual review needed",
  error: "Check failed",
  local_ahead: "Local commits ahead",
  not_configured: "Not configured",
  up_to_date: "Up to date",
  update_available: "Update available",
};

const STATUS_CLASSES: Record<UpdateStatus["state"], string> = {
  diverged: "bg-amber-100 text-amber-900",
  error: "bg-red-100 text-red-900",
  local_ahead: "bg-amber-100 text-amber-900",
  not_configured: "bg-slate-100 text-slate-700",
  up_to_date: "bg-emerald-100 text-emerald-900",
  update_available: "bg-sky-100 text-sky-900",
};

function formatCheckedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString();
}

function errorResult(error: unknown): ProductionUpdateResult {
  return {
    ok: false,
    output: error instanceof Error ? error.message : String(error),
  };
}

export function UpdateManager({
  initialStatus,
}: {
  initialStatus: UpdateStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [result, setResult] = useState<ProductionUpdateResult | null>(null);
  const [isChecking, startChecking] = useTransition();
  const [isUpdating, startUpdating] = useTransition();

  const canRunUpdate = status.canUpdate && !isUpdating;
  const lastChecked = useMemo(
    () => formatCheckedAt(status.checkedAt),
    [status.checkedAt],
  );

  function checkForUpdates() {
    setResult(null);
    startChecking(async () => {
      try {
        setStatus(await checkForUpdatesAction());
      } catch (error) {
        setResult(errorResult(error));
      }
    });
  }

  function runUpdate() {
    setResult(null);
    startUpdating(async () => {
      try {
        const updateResult = await runProductionUpdateAction();
        setResult(updateResult);
        setStatus(await checkForUpdatesAction());
      } catch (error) {
        setResult(errorResult(error));
      }
    });
  }

  return (
    <div className="space-y-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <span
            className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-sm font-medium ${STATUS_CLASSES[status.state]}`}
          >
            {STATUS_LABELS[status.state]}
          </span>
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              App Updates
            </h2>
            <p className="mt-1 text-sm text-slate-600">{status.message}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isChecking || isUpdating}
            onClick={checkForUpdates}
            type="button"
          >
            {isChecking ? "Checking..." : "Check GitHub"}
          </button>
          <button
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canRunUpdate}
            onClick={runUpdate}
            type="button"
          >
            {isUpdating ? "Updating..." : "Run Update"}
          </button>
        </div>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-md bg-slate-50 p-3">
          <dt className="font-medium text-slate-500">Current version</dt>
          <dd className="mt-1 font-mono text-slate-950">
            {shortSha(status.currentSha) ?? "Unknown"}
          </dd>
        </div>
        <div className="rounded-md bg-slate-50 p-3">
          <dt className="font-medium text-slate-500">GitHub version</dt>
          <dd className="mt-1 font-mono text-slate-950">
            {shortSha(status.upstreamSha) ?? "Unknown"}
          </dd>
        </div>
        <div className="rounded-md bg-slate-50 p-3">
          <dt className="font-medium text-slate-500">Tracking</dt>
          <dd className="mt-1 text-slate-950">
            {status.remote}/{status.branch}
          </dd>
        </div>
        <div className="rounded-md bg-slate-50 p-3">
          <dt className="font-medium text-slate-500">Last checked</dt>
          <dd className="mt-1 text-slate-950">{lastChecked}</dd>
        </div>
      </dl>

      {!status.updaterEnabled ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          The update button is disabled until{" "}
          <code className="rounded bg-amber-100 px-1 py-0.5">
            ENABLE_APP_UPDATER=true
          </code>{" "}
          is set on this trusted production machine.
        </div>
      ) : null}

      {status.state === "update_available" ? (
        <div className="rounded-md border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          Running the update backs up the SQLite database, pulls the latest
          approved code, installs dependencies, prepares Prisma, builds the app,
          and restarts the process. This page may briefly disconnect while the
          app restarts.
        </div>
      ) : null}

      {status.details ? (
        <pre className="max-h-72 overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100">
          {status.details}
        </pre>
      ) : null}

      {result ? (
        <div
          className={`rounded-md border p-4 text-sm ${
            result.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-red-200 bg-red-50 text-red-950"
          }`}
        >
          <p className="font-medium">
            {result.ok ? "Update finished" : "Update failed"}
          </p>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-white/70 p-3 text-xs text-slate-950">
            {result.output}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
