import "server-only";

type CreateGitHubIssueInput = {
  title: string;
  body: string;
  labels?: string[];
};

export type CreateGitHubIssueResult =
  | {
      ok: true;
      issueNumber: number;
      issueUrl: string;
    }
  | {
      ok: false;
      reason: "not_configured" | "github_error" | "network_error";
      status?: number;
      error?: unknown;
    };

function getGitHubIssueConfig() {
  const repository =
    process.env.GITHUB_ISSUES_REPOSITORY ||
    process.env.GITHUB_REPOSITORY ||
    "FelipeFraul/ticketeira";
  const token = process.env.GITHUB_ISSUES_TOKEN?.trim();

  return {
    repository,
    token,
  };
}

export async function createGitHubIssue({
  title,
  body,
  labels = [],
}: CreateGitHubIssueInput): Promise<CreateGitHubIssueResult> {
  const { repository, token } = getGitHubIssueConfig();

  if (!token) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/issues`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "black-house-codex-whatsapp",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title,
        body,
        labels,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          number?: unknown;
          html_url?: unknown;
        }
      | null;

    if (!response.ok) {
      return {
        ok: false,
        reason: "github_error",
        status: response.status,
        error: payload,
      };
    }

    if (
      typeof payload?.number !== "number" ||
      typeof payload.html_url !== "string"
    ) {
      return {
        ok: false,
        reason: "github_error",
        status: response.status,
        error: payload,
      };
    }

    return {
      ok: true,
      issueNumber: payload.number,
      issueUrl: payload.html_url,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "network_error",
      error,
    };
  }
}
