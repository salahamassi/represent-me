import { NextResponse } from "next/server";
import { fetchGitHubRepos } from "@/services/github-api-service";
import { scoreRepo } from "@/agents/github-agent";

export async function GET() {
  try {
    const allRepos = await fetchGitHubRepos();
    const repos = allRepos.filter((r) => !r.isArchived);
    const scored = repos.map((r) => ({
      ...r,
      healthScore: scoreRepo(r),
    }));
    return NextResponse.json(scored);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch repos" },
      { status: 500 }
    );
  }
}
