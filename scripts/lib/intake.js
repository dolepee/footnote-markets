export const intakeApiUrl =
  "https://api.github.com/repos/dolepee/footnote-markets/issues?labels=creator-source&state=open&per_page=100";

export function parseIssueField(body, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`### ${escaped}\\s+([\\s\\S]*?)(?=\\n### |$)`, "i"));
  return match ? match[1].trim().replace(/^_No response_$/i, "") : "";
}

export function issueToCandidate(issue) {
  const body = issue.body || "";
  return {
    issue: issue.number,
    issueUrl: issue.html_url,
    creator: parseIssueField(body, "Creator name") || issue.user?.login || "Creator",
    sourceUrl: parseIssueField(body, "Source URL"),
    payoutWallet: parseIssueField(body, "Arc-compatible payout wallet"),
    price: parseIssueField(body, "Requested price per citation") || "0.004",
    bond: parseIssueField(body, "Optional credibility bond") || "0",
    summary: parseIssueField(body, "Why should agents cite it?") || "Creator-submitted source.",
    title: issue.title.replace(/^Creator source:\s*/i, "").trim() || "Submitted creator source",
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchCreatorIntake() {
  const response = await fetch(intakeApiUrl, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`GitHub intake fetch failed: ${response.status}`);
  const issues = await response.json();
  return issues.filter((issue) => !issue.pull_request).map(issueToCandidate);
}
