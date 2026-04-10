/**
 * AI GitHub Agent — Multi-mode agent:
 * - "profile": Analyze user's GitHub presence (original)
 * - "issue-hunter": Search for OSS issues matching skills
 * - "pr-tracker": Track PR lifecycle for active contributions
 * Also responds to "github:analyze-repo" for Code Gems mining.
 */

import { AIAgent, type AIAgentConfig } from "../base/ai-agent";
import type { AgentBus } from "../base/agent-bus";
import { GitHubAnalysisSchema } from "../schemas/github.schema";
import { IssueAnalysisSchema, type IssueAnalysis } from "../schemas/issue-analysis.schema";
import { CodeGemsAnalysisSchema, type CodeGemsAnalysis } from "../schemas/code-gems.schema";
import {
  fetchGitHubRepos,
  fetchGitHubProfile,
  searchIssuesForSkills,
  fetchRepoReadme,
  fetchUserPRsInRepo,
  fetchRepoTree,
  fetchRepoContents,
  type GitHubIssueResult,
} from "@/services/github-api-service";
import {
  isContributionSeen,
  insertContribution,
  getActiveContributions,
  updateContributionStatus,
  markContributionContentGenerated,
} from "@/lib/db";
import * as telegram from "@/lib/telegram";
import type { AgentResult, Finding, ActionItem, OSSContribution } from "@/types";

export class GitHubAIAgent extends AIAgent {
  constructor(bus: AgentBus) {
    const config: AIAgentConfig = {
      id: "github",
      name: "AI GitHub Agent",
      systemPrompt: "",
      temperature: 0.3,
      maxTokens: 2000,
    };
    super(config, bus);

    this.config.systemPrompt = `You are a GitHub expert and open-source contribution advisor.

You are working for this developer:
${this.getProfileContext()}

You help with:
1. Analyzing their GitHub profile for recruiter optimization
2. Finding open-source issues they can realistically solve
3. Analyzing code in repos to find interesting patterns and gems`;

    // Register responder for Code Gems mining requests from Content Agent
    this.bus.respond("github:analyze-repo", async (payload) => {
      const { owner, repo, branch } = payload as { owner: string; repo: string; branch?: string };
      return await this.analyzeRepoForGems(owner, repo, branch);
    });
  }

  async run(context?: Record<string, unknown>): Promise<AgentResult> {
    this.currentRunId = context?.runId as number | undefined;
    const mode = (context?.mode as string) || "profile";

    switch (mode) {
      case "issue-hunter":
        return this.runIssueHunter();
      case "pr-tracker":
        return this.runPRTracker();
      case "weekly-report":
        return this.runWeeklyReport();
      default:
        return this.runProfileAnalysis();
    }
  }

  // ===== MODE: Profile Analysis (original) =====

  private async runProfileAnalysis(): Promise<AgentResult> {
    const findings: Finding[] = [];
    const actionItems: ActionItem[] = [];

    try {
      this.logStep("fetch", "Fetching GitHub profile and repos");
      const [profileData, repos] = await Promise.all([
        fetchGitHubProfile(),
        fetchGitHubRepos(),
      ]);

      const originalRepos = repos.filter((r) => !r.isFork);
      const repoSummary = originalRepos
        .sort((a, b) => b.stars - a.stars)
        .slice(0, 20)
        .map((r) => `- ${r.name} (${r.language || "?"}) ★${r.stars} | ${r.description || "no desc"} | topics: ${r.topics.join(",")} | last: ${r.lastCommit.slice(0, 10)}`)
        .join("\n");

      const prompt = `Analyze this GitHub profile:

Username: ${profileData.username}
Bio: "${profileData.bio}"
Company: ${profileData.company || "not set"}
Followers: ${profileData.followers}
Total repos: ${repos.length} (${originalRepos.length} original, ${repos.length - originalRepos.length} forks)
Total stars: ${profileData.totalStars}
Top languages: ${profileData.topLanguages.slice(0, 5).map((l) => `${l.language}(${l.count})`).join(", ")}

Top 20 original repos:
${repoSummary}

Return JSON with profileRecommendations, repoInsights, contributionStrategy, overallScore.`;

      const result = await this.analyze(prompt, GitHubAnalysisSchema);
      const analysis = result.data;

      if (profileData.bio !== analysis.profileRecommendations.bio) {
        findings.push({
          id: "github-bio", agentId: "github", severity: "critical",
          title: "Update GitHub bio",
          description: `Current: "${profileData.bio}" → Suggested: "${analysis.profileRecommendations.bio}"`,
          category: "profile",
        });
      }

      findings.push({
        id: "github-score", agentId: "github",
        severity: analysis.overallScore >= 60 ? "positive" : "warning",
        title: `GitHub Presence Score: ${analysis.overallScore}/100`,
        description: `${originalRepos.length} original repos, ${profileData.totalStars} stars, ${profileData.followers} followers`,
        category: "score",
      });

      for (const insight of analysis.repoInsights) {
        if (insight.action === "improve" || insight.action === "feature") {
          actionItems.push({
            id: `repo-${insight.name}`, agentId: "github",
            priority: insight.action === "feature" ? "high" : "medium", effort: "moderate",
            title: `${insight.action === "feature" ? "Feature" : "Improve"}: ${insight.name}`,
            description: insight.reasoning + (insight.readmeSuggestion ? ` README: ${insight.readmeSuggestion}` : ""),
            completed: false,
          });
        }
      }

      const highlights = [
        `Score: ${analysis.overallScore}/100`,
        `Pin: ${analysis.profileRecommendations.pinnedRepos.join(", ")}`,
        `Goal: ${analysis.contributionStrategy.weeklyGoal}`,
      ];
      await telegram.sendAgentSummary("AI GitHub Agent", findings.length, highlights);

      await this.bus.publish("github:analysis-complete", "github", {
        score: analysis.overallScore,
        highlights,
        pinnedRepos: analysis.profileRecommendations.pinnedRepos,
      });

    } catch (err) {
      console.error("[AI GitHub] Error:", err);
      findings.push({
        id: "github-error", agentId: "github", severity: "critical",
        title: "GitHub analysis failed",
        description: err instanceof Error ? err.message : String(err),
        category: "error",
      });
    }

    return { findings, actionItems };
  }

  // ===== MODE: Issue Hunter =====

  private async runIssueHunter(): Promise<AgentResult> {
    const findings: Finding[] = [];
    const actionItems: ActionItem[] = [];

    try {
      this.logStep("fetch", "Searching GitHub for matching issues", { skills: ["swift", "dart", "typescript", "kotlin"] });

      const issues = await searchIssuesForSkills(
        ["swift", "dart", "typescript", "kotlin"],
        ["good first issue", "help wanted"]
      );

      this.logStep("fetch", `Found ${issues.length} issues total`, { count: issues.length });

      // Filter out already seen
      const newIssues = issues.filter((i) => !isContributionSeen(i.html_url));
      this.logStep("fetch", `${newIssues.length} new issues after dedup`, { newCount: newIssues.length });

      if (newIssues.length === 0) {
        return { findings, actionItems };
      }

      // Analyze up to 5 with Claude
      const toAnalyze = newIssues.slice(0, 5);

      for (const issue of toAnalyze) {
        try {
          const readme = await fetchRepoReadme(issue.repoOwner, issue.repoName);
          const analysis = await this.analyzeIssue(issue, readme);

          if (analysis.skillMatch < 40) {
            console.log(`[IssueHunter] Skip ${issue.title} (${analysis.skillMatch}% match)`);
            continue;
          }

          // Save to DB
          const contributionId = insertContribution({
            issueUrl: issue.html_url,
            repoOwner: issue.repoOwner,
            repoName: issue.repoName,
            issueNumber: issue.number,
            issueTitle: issue.title,
            issueLabels: issue.labels.map((l) => l.name),
            language: issue.repoName, // Will be refined
            aiAnalysis: JSON.stringify(analysis),
          });

          // Notify via Telegram
          if (analysis.skillMatch >= 60) {
            await telegram.sendIssueAlert(
              contributionId,
              {
                title: issue.title,
                repoOwner: issue.repoOwner,
                repoName: issue.repoName,
                url: issue.html_url,
              },
              analysis
            );
          }

          findings.push({
            id: `issue-${issue.number}`, agentId: "github",
            severity: analysis.skillMatch >= 70 ? "positive" : "info",
            title: `${analysis.skillMatch}% match: ${issue.title}`,
            description: `${issue.repoOwner}/${issue.repoName} | ${analysis.issueType} | ${analysis.difficulty} | ~${analysis.estimatedHours}h`,
            category: "oss-issue",
            evidence: issue.html_url,
          });

        } catch (err) {
          console.error(`[IssueHunter] Failed to analyze issue ${issue.number}:`, err);
        }
      }

    } catch (err) {
      console.error("[IssueHunter] Error:", err);
    }

    return { findings, actionItems };
  }

  private async analyzeIssue(issue: GitHubIssueResult, readme: string): Promise<IssueAnalysis> {
    const prompt = `Analyze this GitHub issue for the candidate:

Repository: ${issue.repoOwner}/${issue.repoName}
Issue #${issue.number}: ${issue.title}
Labels: ${issue.labels.map((l) => l.name).join(", ")}
Comments: ${issue.comments}
Created: ${issue.created_at}

Issue body:
${issue.body.slice(0, 2000)}

Repository README (excerpt):
${readme.slice(0, 1000)}

Return a JSON object with this EXACT structure (use these exact camelCase key names):
{
  "issueType": "bug",
  "difficulty": "beginner",
  "estimatedHours": 3,
  "relevantSkills": ["Swift", "UIKit"],
  "skillMatch": 75,
  "approachSummary": "Brief summary of how to solve it",
  "approachSteps": ["Step 1", "Step 2", "Step 3"],
  "filesToModify": ["path/to/file.swift"],
  "potentialChallenges": ["Challenge 1"],
  "learningValue": "What the candidate will learn",
  "contentPotential": "high"
}

issueType must be one of: "bug", "feature", "enhancement", "documentation", "refactor"
difficulty must be one of: "beginner", "intermediate", "advanced"
contentPotential must be one of: "high", "medium", "low"
ALL fields are required. filesToModify can be an empty array if unknown.`;

    const result = await this.analyze(prompt, IssueAnalysisSchema);
    return result.data;
  }

  // ===== MODE: PR Tracker =====

  private async runPRTracker(): Promise<AgentResult> {
    const findings: Finding[] = [];
    const actionItems: ActionItem[] = [];

    try {
      const active = getActiveContributions() as OSSContribution[];
      console.log(`[PRTracker] Checking ${active.length} active contributions`);

      for (const contrib of active) {
        try {
          const prs = await fetchUserPRsInRepo(contrib.repo_owner, contrib.repo_name);

          // Match PR to issue (check for issue number reference)
          const matchedPR = prs.find((pr) => {
            const body = (pr.body || "").toLowerCase();
            const title = pr.title.toLowerCase();
            const issueRef = `#${contrib.issue_number}`;
            return body.includes(issueRef) || title.includes(issueRef) ||
              title.includes(contrib.issue_title.toLowerCase().slice(0, 30));
          });

          if (!matchedPR) continue;

          if (contrib.status === "working" && matchedPR.state === "open") {
            // PR opened!
            console.log(`[PRTracker] PR opened for issue #${contrib.issue_number}`);
            updateContributionStatus(contrib.id, "pr_opened", {
              prUrl: matchedPR.html_url,
              prNumber: matchedPR.number,
            });

            await telegram.sendPRUpdate(contrib, "pr_opened");

            // Trigger content generation
            await this.bus.publish("issue:pr-opened", "github", {
              contributionId: contrib.id,
              contribution: contrib,
              prUrl: matchedPR.html_url,
            });

            findings.push({
              id: `pr-opened-${contrib.id}`, agentId: "github", severity: "positive",
              title: `PR opened: ${contrib.issue_title}`,
              description: `${contrib.repo_owner}/${contrib.repo_name} #${matchedPR.number}`,
              category: "pr-lifecycle",
              evidence: matchedPR.html_url,
            });

          } else if (contrib.status === "pr_opened" && matchedPR.merged) {
            // PR merged!
            console.log(`[PRTracker] PR merged for issue #${contrib.issue_number}!`);
            updateContributionStatus(contrib.id, "pr_merged");

            await telegram.sendPRUpdate(contrib, "pr_merged");

            // Trigger full content suite generation
            await this.bus.publish("issue:pr-merged", "github", {
              contributionId: contrib.id,
              contribution: contrib,
              prUrl: matchedPR.html_url,
            });

            findings.push({
              id: `pr-merged-${contrib.id}`, agentId: "github", severity: "positive",
              title: `PR MERGED: ${contrib.issue_title}`,
              description: `${contrib.repo_owner}/${contrib.repo_name} — Content generation triggered`,
              category: "pr-lifecycle",
              evidence: matchedPR.html_url,
            });
          }

        } catch (err) {
          console.error(`[PRTracker] Error checking ${contrib.repo_name}:`, err);
        }
      }

    } catch (err) {
      console.error("[PRTracker] Error:", err);
    }

    return { findings, actionItems };
  }

  // ===== MODE: Weekly Report =====

  private async runWeeklyReport(): Promise<AgentResult> {
    const findings: Finding[] = [];
    const actionItems: ActionItem[] = [];

    try {
      this.logStep("fetch", "Generating weekly GitHub report");

      const { insertGitHubSnapshot, getLatestGitHubSnapshot } = await import("@/lib/db");
      const profileData = await fetchGitHubProfile();

      // Get previous snapshot for comparison
      const prevSnapshot = getLatestGitHubSnapshot() as {
        total_repos: number;
        original_repos: number;
        total_stars: number;
        followers: number;
      } | undefined;

      // Save current snapshot
      insertGitHubSnapshot({
        totalRepos: profileData.publicRepos || (profileData.originalRepos + profileData.forkedRepos),
        originalRepos: profileData.originalRepos,
        totalStars: profileData.totalStars,
        followers: profileData.followers,
        topLanguages: JSON.stringify(profileData.topLanguages),
      });

      // Calculate diffs
      const starsDiff = prevSnapshot ? profileData.totalStars - prevSnapshot.total_stars : 0;
      const reposDiff = prevSnapshot
        ? (profileData.originalRepos + profileData.forkedRepos) - prevSnapshot.total_repos
        : 0;
      const followersDiff = prevSnapshot ? profileData.followers - prevSnapshot.followers : 0;

      const highlights = [
        `Stars: ${profileData.totalStars}${starsDiff !== 0 ? ` (${starsDiff > 0 ? "+" : ""}${starsDiff})` : ""}`,
        `Repos: ${profileData.originalRepos + profileData.forkedRepos}${reposDiff !== 0 ? ` (${reposDiff > 0 ? "+" : ""}${reposDiff})` : ""}`,
        `Followers: ${profileData.followers}${followersDiff !== 0 ? ` (${followersDiff > 0 ? "+" : ""}${followersDiff})` : ""}`,
      ];

      findings.push({
        id: "weekly-report",
        agentId: "github",
        severity: starsDiff > 0 ? "positive" : "info",
        title: `Weekly Report: ${starsDiff > 0 ? `+${starsDiff} stars` : "No change in stars"}`,
        description: highlights.join(" | "),
        category: "weekly-report",
      });

      this.logStep("generate", "Weekly report generated", { starsDiff, reposDiff, followersDiff });

      // Send to Telegram
      const telegramMod = await import("@/lib/telegram");
      await telegramMod.sendAgentSummary("Weekly GitHub Report", highlights.length, highlights);

    } catch (err) {
      console.error("[WeeklyReport] Error:", err);
      findings.push({
        id: "weekly-report-error", agentId: "github", severity: "critical",
        title: "Weekly report failed",
        description: err instanceof Error ? err.message : String(err),
        category: "error",
      });
    }

    return { findings, actionItems };
  }

  // ===== Code Gems Responder (called by Content Agent via bus) =====

  async analyzeRepoForGems(owner: string, repo: string, branch?: string): Promise<CodeGemsAnalysis> {
    const repoName = `${owner}/${repo}`;
    this.logStep("fetch", `Analyzing repo for gems: ${repoName}`, { repoName });

    const tree = await fetchRepoTree(owner, repo, branch);
    this.logStep("fetch", `Found ${tree.length} source files in ${repoName}`, { fileCount: tree.length });

    if (tree.length === 0) {
      return { gems: [] };
    }

    // Pick interesting files (larger ones, non-trivial names)
    const selectedFiles = tree.slice(0, 8);
    const fileContents: { path: string; content: string }[] = [];

    for (const file of selectedFiles) {
      const content = await fetchRepoContents(owner, repo, file.path, branch);
      if (content.length > 50) {
        fileContents.push({ path: file.path, content: content.slice(0, 1500) });
      }
    }

    if (fileContents.length === 0) {
      return { gems: [] };
    }

    const filesText = fileContents
      .map((f) => `--- ${f.path} ---\n${f.content}`)
      .join("\n\n");

    const prompt = `Analyze these source files from the "${repoName}" repository and find hidden gems — interesting patterns, clever solutions, architecture decisions, or optimizations that would make great technical content.

Files:
${filesText}

Find 2-4 gems. Return a JSON object with this EXACT structure (use these exact camelCase key names):
{
  "gems": [
    {
      "repoName": "${repoName}",
      "filePath": "path/to/file.swift",
      "gemType": "pattern",
      "title": "Short descriptive title",
      "description": "What this code does",
      "codeSnippet": "the relevant code snippet",
      "whyInteresting": "Why this is noteworthy",
      "contentAngle": "How to turn this into content",
      "suggestedPlatform": "linkedin",
      "suggestedTitle": "Post/article title"
    }
  ]
}

gemType must be one of: "pattern", "architecture", "trick", "optimization"
suggestedPlatform must be one of: "linkedin", "medium", "devto"
ALL fields are required strings. Do NOT omit any field.`;

    const result = await this.analyze(prompt, CodeGemsAnalysisSchema, { maxTokens: 2500 });
    return result.data;
  }
}
