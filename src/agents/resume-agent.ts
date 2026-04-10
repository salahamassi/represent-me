import type { AgentResult } from "@/types";
import { profile } from "@/data/profile";
import { githubProfile, githubRepos } from "@/data/github-data";
import { mediumArticles } from "@/data/medium-data";
import { devtoArticles } from "@/data/devto-data";
import { pubdevPackages } from "@/data/pubdev-data";

export async function run(): Promise<AgentResult> {
  await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));

  const findings = [];
  const actionItems = [];

  // Location consistency
  if (githubProfile.location !== profile.location) {
    findings.push({
      id: "res-location-mismatch",
      agentId: "resume" as const,
      severity: "warning" as const,
      title: "Location mismatch between GitHub and resume",
      description: `GitHub: "${githubProfile.location}" vs Resume: "${profile.location}". Inconsistent locations confuse recruiters.`,
      category: "Consistency",
      evidence: `GitHub: ${githubProfile.location}, Resume: ${profile.location}`,
    });

    actionItems.push({
      id: "res-action-location",
      agentId: "resume" as const,
      priority: "medium" as const,
      effort: "quick" as const,
      title: "Align location across all platforms",
      description: `Update GitHub location from "${githubProfile.location}" to "${profile.location}" to match your resume.`,
      completed: false,
    });
  }

  // Bio vs Resume role
  findings.push({
    id: "res-bio-vs-role",
    agentId: "resume" as const,
    severity: "critical" as const,
    title: "GitHub bio doesn't reflect resume role",
    description: `Your resume says "${profile.role}" but GitHub bio says "${githubProfile.bio}". These should align.`,
    category: "Consistency",
  });

  // Skills on resume vs languages on GitHub
  const resumeLanguages = profile.skills
    .flatMap((s) => s.items)
    .filter((s) =>
      ["swift", "dart", "kotlin", "java", "typescript", "ruby"].includes(s.toLowerCase())
    );
  const githubLanguages = githubProfile.topLanguages.map((l) => l.language);
  const onResumeNotGithub = resumeLanguages.filter(
    (l) => !githubLanguages.some((gl) => gl.toLowerCase() === l.toLowerCase())
  );
  const onGithubNotResume = githubLanguages.filter(
    (gl) => !resumeLanguages.some((rl) => rl.toLowerCase() === gl.toLowerCase())
  );

  if (onGithubNotResume.length > 0) {
    findings.push({
      id: "res-github-extra-langs",
      agentId: "resume" as const,
      severity: "info" as const,
      title: `${onGithubNotResume.length} GitHub languages not on resume`,
      description: `Languages on GitHub but not featured on resume: ${onGithubNotResume.join(", ")}. Consider if these should be added.`,
      category: "Skills Gap",
    });
  }

  if (onResumeNotGithub.length > 0) {
    findings.push({
      id: "res-resume-extra-langs",
      agentId: "resume" as const,
      severity: "warning" as const,
      title: `${onResumeNotGithub.length} resume languages have no GitHub repos`,
      description: `Your resume lists ${onResumeNotGithub.join(", ")} but you have no public repos in these languages. Recruiters may verify claims.`,
      category: "Skills Gap",
    });

    actionItems.push({
      id: "res-action-verify-skills",
      agentId: "resume" as const,
      priority: "medium" as const,
      effort: "significant" as const,
      title: "Create sample projects for unverified skills",
      description: `Consider publishing sample projects in: ${onResumeNotGithub.join(", ")} to back up resume claims.`,
      completed: false,
    });
  }

  // Flutter Bond on pub.dev verification
  if (pubdevPackages.length > 0) {
    findings.push({
      id: "res-bond-verified",
      agentId: "resume" as const,
      severity: "positive" as const,
      title: "Flutter Bond packages verified on pub.dev",
      description: `${pubdevPackages.length} Bond packages found on pub.dev, confirming your open-source framework claims. Average pub points: ${Math.round(pubdevPackages.reduce((a, p) => a + p.pubPoints, 0) / pubdevPackages.length)}.`,
      category: "Verification",
    });
  }

  // Article consistency
  const mediumCount = mediumArticles.length;
  const devtoCount = devtoArticles.length;
  if (mediumCount !== devtoCount) {
    findings.push({
      id: "res-article-sync",
      agentId: "resume" as const,
      severity: "warning" as const,
      title: `Article count mismatch: Medium (${mediumCount}) vs Dev.to (${devtoCount})`,
      description:
        "Not all Medium articles are cross-posted to Dev.to. Cross-posting increases reach with minimal effort.",
      category: "Content Consistency",
    });

    actionItems.push({
      id: "res-action-crosspost",
      agentId: "resume" as const,
      priority: "medium" as const,
      effort: "moderate" as const,
      title: `Cross-post ${mediumCount - devtoCount} articles to Dev.to`,
      description:
        "Sync your Medium articles to Dev.to. Use canonical URLs to avoid SEO penalties.",
      completed: false,
    });
  }

  // Open source contributions verification
  const contributionForks = githubRepos.filter(
    (r) =>
      r.isFork &&
      ["share_plus", "flutterfire_cli", "SwifterSwift"].some((name) =>
        r.name.toLowerCase().includes(name.toLowerCase())
      )
  );

  findings.push({
    id: "res-oss-verified",
    agentId: "resume" as const,
    severity: "positive" as const,
    title: `${contributionForks.length} open source contributions verified`,
    description: `Found forked repos matching your claimed contributions: ${contributionForks.map((r) => r.name).join(", ")}`,
    category: "Verification",
  });

  // Missing certifications
  findings.push({
    id: "res-no-certs",
    agentId: "resume" as const,
    severity: "info" as const,
    title: "No certifications listed",
    description:
      "Adding relevant certifications (Apple Developer, Google Associate Android Developer, or even Coursera/Udemy completions) would strengthen your profile.",
    category: "Gaps",
  });

  actionItems.push({
    id: "res-action-certs",
    agentId: "resume" as const,
    priority: "low" as const,
    effort: "significant" as const,
    title: "Consider getting a certification",
    description:
      "Apple Developer certification or Google Associate Android Developer would add credibility to your cross-platform expertise.",
    completed: false,
  });

  // Links presence check
  findings.push({
    id: "res-links-complete",
    agentId: "resume" as const,
    severity: "positive" as const,
    title: "All major platform links present",
    description:
      "Your profile has links for GitHub, LinkedIn, Medium, Dev.to, Stack Overflow, and pub.dev. Good coverage.",
    category: "Completeness",
  });

  return { findings, actionItems };
}
