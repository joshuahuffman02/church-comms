export type UpdateState =
  | "not_configured"
  | "up_to_date"
  | "update_available"
  | "local_ahead"
  | "diverged"
  | "error";

export type UpdateStatus = {
  branch: string;
  canUpdate: boolean;
  checkedAt: string;
  currentSha: string | null;
  details?: string;
  message: string;
  remote: string;
  state: UpdateState;
  upstreamSha: string | null;
  updaterEnabled: boolean;
};

export type ProductionUpdateResult = {
  ok: boolean;
  output: string;
};

type GitUpdateInput = {
  currentSha?: string | null;
  mergeBaseSha?: string | null;
  upstreamSha?: string | null;
};

export function shortSha(sha: string | null | undefined) {
  return sha ? sha.slice(0, 7) : null;
}

export function deriveUpdateState(input: GitUpdateInput): UpdateState {
  const currentSha = input.currentSha?.trim();
  const upstreamSha = input.upstreamSha?.trim();
  const mergeBaseSha = input.mergeBaseSha?.trim();

  if (!currentSha || !upstreamSha) {
    return "not_configured";
  }

  if (currentSha === upstreamSha) {
    return "up_to_date";
  }

  if (mergeBaseSha === currentSha) {
    return "update_available";
  }

  if (mergeBaseSha === upstreamSha) {
    return "local_ahead";
  }

  return "diverged";
}
