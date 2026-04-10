import type { AgentResult, Finding, ActionItem } from "@/types";
import { githubProfile, githubRepos } from "@/data/github-data";
import { profile } from "@/data/profile";

function scoreRepo(repo: (typeof githubRepos)[0]): number {
  let score = 0;
  if (repo.description) score += 15;
  if (repo.hasReadme) score += 20;
  if (repo.topics.length > 0) score += 10;
  if (!repo.isFork) score += 15;
  const monthsSinceCommit =
    (Date.now() - new Date(repo.lastCommit).getTime()) / (1000 * 60 * 60 * 24 * 30);
  if (monthsSinceCommit < 6) score += 15;
  else if (monthsSinceCommit < 12) score += 10;
  else if (monthsSinceCommit < 24) score += 5;
  if (repo.stars >= 10) score += 15;
  else if (repo.stars >= 3) score += 10;
  else if (repo.stars >= 1) score += 5;
  return Math.min(score, 100);
}

export async function run(): Promise<AgentResult> {
  await new Promise((r) => setTimeout(r, 800 + Math.random() * 700));

  const findings: Finding[] = [];
  const actionItems: ActionItem[] = [];

  // Profile audit
  findings.push({
    id: "gh-bio-outdated",
    agentId: "github",
    severity: "critical",
    title: "GitHub bio is outdated and undersells your experience",
    description: `Your current bio says "${githubProfile.bio}" — this doesn't reflect your 5+ years of experience, leadership roles, or framework authorship.`,
    category: "Profile",
    evidence: githubProfile.bio,
  });

  actionItems.push({
    id: "gh-action-bio",
    agentId: "github",
    priority: "high",
    effort: "quick",
    title: "Update GitHub bio",
    description:
      'Change bio to: "Senior Mobile Engineer | iOS & Flutter | Creator of Flutter Bond framework | VP Innovation"',
    completed: false,
    link: "https://github.com/settings/profile",
  });

  if (!githubProfile.company) {
    findings.push({
      id: "gh-no-company",
      agentId: "github",
      severity: "warning",
      title: "No company affiliation set",
      description:
        "Your GitHub profile has no company. Recruiters filter by company. Set it to your current employer.",
      category: "Profile",
    });

    actionItems.push({
      id: "gh-action-company",
      agentId: "github",
      priority: "high",
      effort: "quick",
      title: "Set company to Nologystore W.L.L",
      description: "Add your current company to your GitHub profile for recruiter visibility.",
      completed: false,
      link: "https://github.com/settings/profile",
    });
  }

  findings.push({
    id: "gh-location-outdated",
    agentId: "github",
    severity: "warning",
    title: "GitHub location doesn't match resume",
    description: `GitHub says "${githubProfile.location}" but your resume says "${profile.location}". Keep these consistent.`,
    category: "Profile",
    evidence: githubProfile.location,
  });

  actionItems.push({
    id: "gh-action-location",
    agentId: "github",
    priority: "medium",
    effort: "quick",
    title: "Update GitHub location to Cairo, Egypt",
    description: "Match your GitHub location to your resume for consistency.",
    completed: false,
    link: "https://github.com/settings/profile",
  });

  // Follower analysis
  findings.push({
    id: "gh-followers",
    agentId: "github",
    severity: "positive",
    title: "Solid follower base of 102",
    description:
      "102 followers is above average for your repo count. This is a good foundation to build on with more visible projects.",
    category: "Profile",
  });

  // Repo analysis
  const originalRepos = githubRepos.filter((r) => !r.isFork);
  const reposWithoutDesc = originalRepos.filter((r) => !r.description);
  const reposWithoutTopics = originalRepos.filter((r) => r.topics.length === 0);
  const lowScoreRepos = originalRepos.filter((r) => scoreRepo(r) < 40);

  if (reposWithoutDesc.length > 0) {
    findings.push({
      id: "gh-missing-descriptions",
      agentId: "github",
      severity: "warning",
      title: `${reposWithoutDesc.length} original repos have no description`,
      description:
        "Repos without descriptions are invisible in search. Each description should be a single sentence explaining what the project does.",
      category: "Repos",
      evidence: reposWithoutDesc.map((r) => r.name).join(", "),
    });

    actionItems.push({
      id: "gh-action-descriptions",
      agentId: "github",
      priority: "high",
      effort: "moderate",
      title: `Add descriptions to ${reposWithoutDesc.length} repos`,
      description: `Missing descriptions on: ${reposWithoutDesc.map((r) => r.name).join(", ")}`,
      completed: false,
    });
  }

  if (reposWithoutTopics.length > 0) {
    findings.push({
      id: "gh-missing-topics",
      agentId: "github",
      severity: "info",
      title: `${reposWithoutTopics.length} repos have no topics/tags`,
      description:
        "Topics help GitHub categorize your repos and improve discoverability in search results.",
      category: "Repos",
    });

    actionItems.push({
      id: "gh-action-topics",
      agentId: "github",
      priority: "medium",
      effort: "moderate",
      title: "Add topics to repos",
      description:
        "Add relevant topics (swift, flutter, ios, android, etc.) to your original repos for better discoverability.",
      completed: false,
    });
  }

  // Fork analysis
  const forkRatio = githubProfile.forkedRepos / githubProfile.publicRepos;
  if (forkRatio > 0.5) {
    findings.push({
      id: "gh-high-fork-ratio",
      agentId: "github",
      severity: "warning",
      title: `${Math.round(forkRatio * 100)}% of repos are forks`,
      description: `${githubProfile.forkedRepos} of ${githubProfile.publicRepos} repos are forks. This dilutes your original work. Consider archiving inactive forks that don't have meaningful contributions.`,
      category: "Repos",
    });

    actionItems.push({
      id: "gh-action-archive-forks",
      agentId: "github",
      priority: "medium",
      effort: "moderate",
      title: "Archive or delete inactive forks",
      description:
        "Remove forks you haven't contributed to. Keep only forks where you submitted PRs (share_plus, flutterfire_cli, SwifterSwift).",
      completed: false,
    });
  }

  // Pin recommendations
  const pinCandidates = originalRepos
    .map((repo) => ({
      repo,
      score:
        repo.stars * 3 +
        (repo.hasReadme ? 20 : 0) +
        (repo.description ? 15 : 0) +
        (repo.topics.length > 0 ? 10 : 0) +
        (repo.name.includes("bond") || repo.name.includes("AppRouter") ? 25 : 0) +
        (repo.language === "Swift" || repo.language === "Dart" ? 10 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  findings.push({
    id: "gh-pin-strategy",
    agentId: "github",
    severity: "info",
    title: "Recommended pinned repos",
    description: `Pin these 6 repos to showcase your best work: ${pinCandidates.map((p) => p.repo.name).join(", ")}`,
    category: "Strategy",
    evidence: pinCandidates.map((p) => `${p.repo.name} (score: ${p.score})`).join(", "),
  });

  actionItems.push({
    id: "gh-action-pin",
    agentId: "github",
    priority: "high",
    effort: "quick",
    title: "Pin your top 6 repos",
    description: `Pin: ${pinCandidates.map((p) => p.repo.name).join(", ")}`,
    completed: false,
    link: "https://github.com/salahamassi",
  });

  // Low score repos
  if (lowScoreRepos.length > 0) {
    findings.push({
      id: "gh-low-score-repos",
      agentId: "github",
      severity: "info",
      title: `${lowScoreRepos.length} repos need attention (score < 40)`,
      description:
        "These repos are missing descriptions, READMEs, topics, or haven't been updated recently.",
      category: "Repos",
      evidence: lowScoreRepos.map((r) => `${r.name}: ${scoreRepo(r)}/100`).join(", "),
    });
  }

  // Star analysis
  findings.push({
    id: "gh-stars-low",
    agentId: "github",
    severity: "info",
    title: "48 total stars across all repos",
    description:
      "Stars are concentrated in Android-Mask-Date-EditText (22) and Quran-svg-mobile (10). Promoting Flutter Bond packages could significantly increase total stars.",
    category: "Visibility",
  });

  actionItems.push({
    id: "gh-action-promote-bond",
    agentId: "github",
    priority: "high",
    effort: "significant",
    title: "Create a Flutter Bond monorepo showcase",
    description:
      "Create a main flutter_bond repo that links all Bond packages with a professional README, architecture diagram, and getting started guide. This gives visitors one place to understand the entire framework.",
    completed: false,
  });

  // Profile README
  actionItems.push({
    id: "gh-action-readme",
    agentId: "github",
    priority: "high",
    effort: "moderate",
    title: "Upgrade your profile README",
    description:
      "Your salahamassi/salahamassi repo is your profile README. Add: a professional intro, tech stack badges, Flutter Bond showcase, recent articles section, and contribution stats.",
    completed: false,
    link: "https://github.com/salahamassi/salahamassi",
  });

  return { findings, actionItems };
}

export { scoreRepo };
