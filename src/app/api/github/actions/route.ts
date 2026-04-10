import { NextRequest, NextResponse } from "next/server";
import {
  getGitHubActions,
  upsertGitHubAction,
  toggleGitHubAction,
  removeGitHubAction,
} from "@/lib/db";
import { fetchGitHubProfile, fetchGitHubRepos } from "@/services/github-api-service";
import { scoreRepo } from "@/agents/github-agent";

export async function GET() {
  // First, generate actions from live GitHub data
  try {
    await generateActionsFromProfile();
  } catch (err) {
    console.error("Failed to generate actions:", err);
  }

  const actions = getGitHubActions();
  return NextResponse.json(actions);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { id, completed } = body;

  if (!id || completed === undefined) {
    return NextResponse.json({ error: "id and completed required" }, { status: 400 });
  }

  toggleGitHubAction(id, completed);
  return NextResponse.json({ success: true });
}

// Scan GitHub profile + repos and generate actionable items
async function generateActionsFromProfile() {
  const profile = await fetchGitHubProfile();
  const repos = await fetchGitHubRepos();

  // --- Profile actions ---
  if (!profile.bio || profile.bio.toLowerCase().includes("under learning")) {
    upsertGitHubAction({
      id: "update-bio",
      category: "profile",
      title: "Update your GitHub bio",
      description: `Current: "${profile.bio || "(empty)"}". Claude will suggest a professional bio based on your profile.`,
      actionType: "auto-fix-profile",
      priority: "high",
    });
  } else {
    removeGitHubAction("update-bio");
  }

  if (!profile.company) {
    upsertGitHubAction({
      id: "set-company",
      category: "profile",
      title: "Set your company on GitHub",
      description: "Recruiters filter by company. Claude will suggest based on your current role.",
      actionType: "auto-fix-profile",
      priority: "high",
    });
  } else {
    removeGitHubAction("set-company");
  }

  // --- Repo actions ---
  // Exclude archived repos from all counts
  const activeRepos = repos.filter((r) => !r.isArchived);
  const originalRepos = activeRepos.filter((r) => !r.isFork);

  // Repos without descriptions
  const noDesc = originalRepos.filter((r) => !r.description);
  if (noDesc.length > 0) {
    upsertGitHubAction({
      id: "add-descriptions",
      category: "repos",
      title: `Add descriptions to ${noDesc.length} repos`,
      description: `These repos have no description: ${noDesc.slice(0, 5).map((r) => r.name).join(", ")}${noDesc.length > 5 ? "..." : ""}. Claude will generate descriptions from your code.`,
      actionType: "auto-fix",
      priority: "medium",
    });
  } else {
    removeGitHubAction("add-descriptions");
  }

  // Repos without topics
  const noTopics = originalRepos.filter((r) => r.topics.length === 0);
  if (noTopics.length > 0) {
    upsertGitHubAction({
      id: "add-topics",
      category: "repos",
      title: `Add topics to ${noTopics.length} repos`,
      description: `Topics help GitHub recommend your repos. Claude will suggest relevant tags based on your code. Missing on: ${noTopics.slice(0, 5).map((r) => r.name).join(", ")}`,
      actionType: "auto-fix",
      priority: "medium",
    });
  } else {
    removeGitHubAction("add-topics");
  }

  // Low health repos that could be improved
  const lowHealth = originalRepos
    .map((r) => ({ ...r, score: scoreRepo(r) }))
    .filter((r) => r.score < 40 && r.stars > 0);

  if (lowHealth.length > 0) {
    upsertGitHubAction({
      id: "improve-low-health",
      category: "repos",
      title: `Improve ${lowHealth.length} repos with low health scores`,
      description: `These starred repos need attention: ${lowHealth.map((r) => `${r.name} (${r.score}/100)`).join(", ")}. Add README, description, and topics.`,
      actionType: "link",
      priority: "medium",
    });
  }

  // Pin recommendations
  const pinnedCandidates = originalRepos
    .sort((a, b) => (b.stars * 3 + scoreRepo(b)) - (a.stars * 3 + scoreRepo(a)))
    .slice(0, 6);

  upsertGitHubAction({
    id: "pin-repos",
    category: "profile",
    title: "Pin your top 6 repos",
    description: `Recommended pins: ${pinnedCandidates.map((r) => r.name).join(", ")}. Pinned repos are the first thing visitors see.`,
    actionUrl: "https://github.com/salahamassi",
    actionType: "link",
    priority: "high",
  });

  // README generation suggestions
  const noReadme = originalRepos.filter((r) => !r.hasReadme && r.stars > 0);
  if (noReadme.length > 0) {
    for (const repo of noReadme.slice(0, 3)) {
      upsertGitHubAction({
        id: `readme-${repo.name}`,
        category: "readme",
        title: `Generate README for ${repo.name}`,
        description: `${repo.name} has ${repo.stars} stars but no README. Use the README Generator in Repo Audit tab.`,
        actionType: "generate-readme",
        priority: "high",
      });
    }
  }

  // Archive old forks (only non-archived ones)
  const oldForks = activeRepos
    .filter((r) => r.isFork)
    .filter((r) => {
      const lastUpdate = new Date(r.lastCommit);
      const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
      return lastUpdate < twoYearsAgo;
    });

  if (oldForks.length > 3) {
    upsertGitHubAction({
      id: "archive-old-forks",
      category: "cleanup",
      title: `Archive ${oldForks.length} old forks`,
      description: `These forks haven't been updated in 2+ years: ${oldForks.slice(0, 5).map((r) => r.name).join(", ")}${oldForks.length > 5 ? "..." : ""}. Archiving keeps your profile clean.`,
      actionType: "auto-fix",
      priority: "low",
    });
  } else {
    removeGitHubAction("archive-old-forks");
  }
}
