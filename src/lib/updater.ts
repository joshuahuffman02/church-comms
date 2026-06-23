import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import {
  deriveUpdateState,
  type ProductionUpdateResult,
  type UpdateState,
  type UpdateStatus,
} from "@/lib/update-status";

const execFileAsync = promisify(execFile);

const DEFAULT_GIT_TIMEOUT_MS = 60_000;
const UPDATE_TIMEOUT_MS = 30 * 60_000;
const MAX_OUTPUT_LENGTH = 12_000;

type ExecError = Error & {
  code?: number | string;
  stdout?: string;
  stderr?: string;
};

function repoRoot() {
  return process.cwd();
}

export function isUpdaterEnabled() {
  return process.env.ENABLE_APP_UPDATER === "true";
}

export function getUpdateTarget() {
  return {
    branch: process.env.UPDATE_BRANCH || "main",
    remote: process.env.UPDATE_REMOTE || "origin",
  };
}

function truncateOutput(output: string) {
  if (output.length <= MAX_OUTPUT_LENGTH) {
    return output;
  }

  return `${output.slice(0, MAX_OUTPUT_LENGTH)}\n\n[output truncated]`;
}

async function runCommand(
  command: string,
  args: string[],
  timeout = DEFAULT_GIT_TIMEOUT_MS,
) {
  const result = await execFileAsync(command, args, {
    cwd: repoRoot(),
    env: process.env,
    maxBuffer: 2 * 1024 * 1024,
    timeout,
  });

  return {
    stderr: result.stderr.trim(),
    stdout: result.stdout.trim(),
  };
}

async function runGit(args: string[], timeout = DEFAULT_GIT_TIMEOUT_MS) {
  return runCommand("git", args, timeout);
}

function statusMessage(state: UpdateState, remote: string, branch: string) {
  switch (state) {
    case "up_to_date":
      return "This install is up to date.";
    case "update_available":
      return `An update is available from ${remote}/${branch}.`;
    case "local_ahead":
      return `This install has local commits ahead of ${remote}/${branch}. Review before updating.`;
    case "diverged":
      return `This install and ${remote}/${branch} have diverged. Update manually so no local work is lost.`;
    case "not_configured":
      return "GitHub update status is not configured for this install.";
    case "error":
      return "Could not check GitHub update status.";
  }
}

export async function getUpdateStatus(
  options: { fetch?: boolean } = {},
): Promise<UpdateStatus> {
  const { branch, remote } = getUpdateTarget();
  const checkedAt = new Date().toISOString();

  try {
    await runGit(["rev-parse", "--is-inside-work-tree"]);
  } catch (error) {
    return {
      branch,
      canUpdate: false,
      checkedAt,
      currentSha: null,
      details: error instanceof Error ? error.message : String(error),
      message: "This install is not running from a Git checkout.",
      remote,
      state: "not_configured" as const,
      upstreamSha: null,
      updaterEnabled: isUpdaterEnabled(),
    };
  }

  try {
    if (options.fetch) {
      await runGit(
        ["fetch", remote, `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`, "--tags"],
        120_000,
      );
    }

    const upstreamRef = `refs/remotes/${remote}/${branch}`;
    const currentSha = (await runGit(["rev-parse", "HEAD"])).stdout;
    const upstreamSha = (
      await runGit(["rev-parse", "--verify", upstreamRef])
    ).stdout;
    const mergeBaseSha = (
      await runGit(["merge-base", "HEAD", upstreamRef])
    ).stdout;
    const state = deriveUpdateState({
      currentSha,
      mergeBaseSha,
      upstreamSha,
    });

    return {
      branch,
      canUpdate: state === "update_available" && isUpdaterEnabled(),
      checkedAt,
      currentSha,
      message: statusMessage(state, remote, branch),
      remote,
      state,
      upstreamSha,
      updaterEnabled: isUpdaterEnabled(),
    };
  } catch (error) {
    const execError = error as ExecError;

    return {
      branch,
      canUpdate: false,
      checkedAt,
      currentSha: null,
      details: truncateOutput(
        [execError.message, execError.stdout, execError.stderr]
          .filter(Boolean)
          .join("\n"),
      ),
      message: statusMessage("error", remote, branch),
      remote,
      state: "error" as const,
      upstreamSha: null,
      updaterEnabled: isUpdaterEnabled(),
    };
  }
}

export async function runProductionUpdateScript(): Promise<ProductionUpdateResult> {
  if (!isUpdaterEnabled()) {
    return {
      ok: false,
      output:
        "The in-app updater is disabled. Set ENABLE_APP_UPDATER=true on the trusted production machine to enable it.",
    };
  }

  const scriptPath = path.join(repoRoot(), "scripts", "update-production.sh");

  if (!existsSync(scriptPath)) {
    return {
      ok: false,
      output: `Update script not found at ${scriptPath}.`,
    };
  }

  try {
    const result = await runCommand("bash", [scriptPath], UPDATE_TIMEOUT_MS);
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");

    return {
      ok: true,
      output: truncateOutput(output || "Update completed."),
    };
  } catch (error) {
    const execError = error as ExecError;

    return {
      ok: false,
      output: truncateOutput(
        [execError.message, execError.stdout, execError.stderr]
          .filter(Boolean)
          .join("\n"),
      ),
    };
  }
}
