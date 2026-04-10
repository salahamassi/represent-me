import { NextResponse } from "next/server";
import { fetchGitHubRepos, archiveRepo } from "@/services/github-api-service";

export async function POST() {
  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json({ error: "GitHub token not configured" }, { status: 500 });
  }

  try {
    const repos = await fetchGitHubRepos();
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);

    const oldForks = repos.filter((r) => {
      if (!r.isFork || r.isArchived) return false;
      const lastUpdate = new Date(r.lastCommit);
      return lastUpdate < twoYearsAgo;
    });

    const results: { repo: string; success: boolean; error?: string }[] = [];

    for (const repo of oldForks) {
      try {
        const ok = await archiveRepo(repo.name);
        results.push({ repo: repo.name, success: ok, error: ok ? undefined : "API returned error" });
      } catch (err) {
        results.push({ repo: repo.name, success: false, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const succeeded = results.filter((r) => r.success).length;

    return NextResponse.json({
      success: true,
      message: `Archived ${succeeded} of ${oldForks.length} old forks`,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Archive failed" },
      { status: 500 }
    );
  }
}
