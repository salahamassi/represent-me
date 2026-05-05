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
  searchIssuesInRepos,
  fetchRepoReadme,
  fetchUserPRsInRepo,
  fetchRepoTree,
  fetchRepoContents,
  type GitHubIssueResult,
} from "@/services/github-api-service";
import { POPULAR_MOBILE_REPOS } from "@/data/mobile-repos";
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
      const { owner, repo, branch, context, path } = payload as {
        owner: string;
        repo: string;
        branch?: string;
        context?: string;
        path?: string;
      };
      return await this.analyzeRepoForGems(owner, repo, branch, context, path);
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
      this.logStep("fetch", `Senior triage: hunting real bugs in ${POPULAR_MOBILE_REPOS.length} curated Flutter/iOS repos`, {
        repoCount: POPULAR_MOBILE_REPOS.length,
      });

      // No label filter — fetch all recently updated open issues, let Claude triage.
      const issues = await searchIssuesInRepos(POPULAR_MOBILE_REPOS);

      this.logStep("fetch", `Found ${issues.length} issues total`, { count: issues.length });

      // Pre-filter: drop issues with non-actionable labels (saves Claude calls)
      const NON_ACTIONABLE = [
        "question", "duplicate", "wontfix", "won't fix", "invalid",
        "discussion", "needs triage", "needs-triage", "waiting for info",
        "waiting-for-info", "stale", "not a bug",
      ];
      const actionableIssues = issues.filter((i) => {
        const labelNames = i.labels.map((l) => l.name.toLowerCase());
        return !labelNames.some((ln) => NON_ACTIONABLE.some((na) => ln.includes(na)));
      });
      this.logStep("fetch", `${actionableIssues.length} actionable issues after label filter`, { actionableCount: actionableIssues.length });

      // Filter out already seen
      const newIssues = actionableIssues.filter((i) => !isContributionSeen(i.html_url));
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

          if (analysis.skillMatch < 50) {
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
    const prompt = `You are triaging a GitHub issue from a popular mobile open-source library for a SENIOR mobile developer (5+ years in Swift, UIKit, SwiftUI, Flutter, Dart, protocol-oriented programming, Clean Architecture, iOS/Android production apps). Their real-world contribution workflow:

1. They use the library in production work
2. They hit a real bug or missing feature
3. They fix it themselves if the scope is tractable (a few hours to a weekend)

Evaluate whether this issue is worth picking up — meaning: is it a REAL actionable bug/enhancement, and could a senior ship a PR for it?

Repository: ${issue.repoOwner}/${issue.repoName}
Issue #${issue.number}: ${issue.title}
Labels: ${issue.labels.map((l) => l.name).join(", ")}
Comments: ${issue.comments}
Created: ${issue.created_at}

Issue body:
${issue.body.slice(0, 2000)}

Repository README (excerpt):
${readme.slice(0, 1000)}

Scoring guidance for skillMatch (0-100):
- 90-100: clear bug in Swift/UIKit/SwiftUI/Flutter/Dart, small scope, senior can ship quickly, high CV value
- 70-89: real bug or enhancement, moderate scope, well within the candidate's skillset
- 50-69: actionable but larger scope OR requires domain knowledge the candidate may lack
- Below 50: question, feature request without clear spec, internal build-system issue, platform-specific (macOS-only, tvOS-only), needs deep maintainer context, or not aligned with Swift/Flutter/iOS/Dart expertise

Return a JSON object with this EXACT structure (use these exact camelCase key names):
{
  "issueType": "bug",
  "difficulty": "intermediate",
  "estimatedHours": 6,
  "relevantSkills": ["Swift", "UIKit"],
  "skillMatch": 75,
  "approachSummary": "Brief summary of how to solve it",
  "approachSteps": ["Step 1", "Step 2", "Step 3"],
  "filesToModify": ["path/to/file.swift"],
  "potentialChallenges": ["Challenge 1"],
  "learningValue": "What the candidate will learn or demonstrate",
  "contentPotential": "high"
}

issueType must be one of: "bug", "feature", "enhancement", "documentation", "refactor"
difficulty must be one of: "beginner", "intermediate", "advanced" (prefer intermediate/advanced — this is senior triage)
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

  async analyzeRepoForGems(
    owner: string,
    repo: string,
    branch?: string,
    context?: string,
    path?: string
  ): Promise<CodeGemsAnalysis> {
    const targetLabel = path ? `${owner}/${repo}:${path}` : `${owner}/${repo}`;
    // repoName carries the full target (with path) into the prompt + the
    // CodeGemsAnalysis schema's repoName field, so downstream gem cards
    // and the chatter feed reflect the actual mining unit (the package),
    // not just the monorepo. Layla's post drafter uses this as well.
    const repoName = targetLabel;
    this.logStep("fetch", `Analyzing for gems: ${targetLabel}`, { targetLabel });

    // Path filter is pushed INTO fetchRepoTree so it applies before
    // the 50-file global slice. Without this, a request for a
    // monorepo subpackage like "packages/form" returns zero files
    // because the slice fills with alphabetically-earlier siblings.
    const pathPrefix = path ? path.replace(/\/+$/, "") + "/" : "";
    const tree = await fetchRepoTree(owner, repo, branch, {
      pathFilter: path,
    });
    this.logStep(
      "fetch",
      `Found ${tree.length} files in ${targetLabel}`,
      { fileCount: tree.length, pathPrefix }
    );

    if (tree.length === 0) {
      return { gems: [] };
    }

    // Selectivity — bias toward the files that actually carry "gems"
    // (README, public lib/ source, example/ usage), drop the noise
    // (generated files, test fixtures, build artefacts). This keeps
    // GitHub API calls under the rate limit AND raises the signal
    // density of the files we hand to Claude.
    const NOISE_PATTERNS = [
      /\.g\.dart$/, // build_runner generated
      /\.freezed\.dart$/, // freezed generated
      /\.gr\.dart$/, // auto_route generated
      /\.config\.dart$/, // injectable generated
      /\.mocks\.dart$/, // mockito generated
      /_test\.dart$/, // tests
      /\/test\//, // test directories
      /\/build\//, // build artefacts
      /\.pb\.dart$/, // protobuf generated
      /\/\.dart_tool\//, // pub cache
      /pubspec\.lock$/, // lockfile
    ];
    const isNoise = (p: string) => NOISE_PATTERNS.some((rx) => rx.test(p));
    /** Tier 1 = strongest gem signal. Tier 4 = leftover, last resort. */
    const tierOf = (p: string): number => {
      const rel = pathPrefix ? p.slice(pathPrefix.length) : p;
      if (/^README\.md$/i.test(rel)) return 1;
      if (rel.startsWith("example/") || rel.startsWith("examples/")) return 1;
      if (rel.startsWith("lib/src/")) return 2;
      if (rel.startsWith("lib/")) return 2;
      if (rel.startsWith("src/")) return 2;
      if (/\.(dart|swift|kt|kts|ts|tsx)$/.test(rel)) return 3;
      return 4;
    };

    const filtered = tree.filter((f) => !isNoise(f.path));
    // Sort by tier ASC, then by size DESC inside the tier so we
    // prefer the substantial files. Random tie-break inside tier 3+
    // so re-runs surface different gems over time.
    const sorted = [...filtered].sort((a, b) => {
      const ta = tierOf(a.path);
      const tb = tierOf(b.path);
      if (ta !== tb) return ta - tb;
      const sa = a.size ?? 0;
      const sb = b.size ?? 0;
      if (Math.abs(sa - sb) > 200) return sb - sa;
      return Math.random() - 0.5;
    });

    const fileContents: { path: string; content: string }[] = [];
    const TARGET_FILES = 6;
    const MAX_ATTEMPTS = 20;

    for (let i = 0; i < sorted.length && i < MAX_ATTEMPTS; i++) {
      if (fileContents.length >= TARGET_FILES) break;
      const file = sorted[i];
      const content = await fetchRepoContents(owner, repo, file.path, branch);
      if (content.length > 200) {
        fileContents.push({ path: file.path, content: content.slice(0, 1800) });
      }
    }

    this.logStep(
      "fetch",
      `Selected ${fileContents.length} substantial files for analysis in ${targetLabel}`,
      { fileCount: fileContents.length, targetLabel, picked: fileContents.map((f) => f.path) }
    );

    if (fileContents.length === 0) {
      this.logStep("error", `No substantial files found in ${repoName} after ${MAX_ATTEMPTS} attempts`, { repoName });
      return { gems: [] };
    }

    const filesText = fileContents
      .map((f) => `--- ${f.path} ---\n${f.content}`)
      .join("\n\n");

    const contextBlock = context
      ? `\nBUSINESS CONTEXT for this repository:\n${context}\n\nUse this context to understand WHY the code was written this way. The business domain, users, and stakeholders matter more than the pattern name.\n`
      : "";

    const prompt = `Analyze these source files from the "${repoName}" repository and find hidden gems — interesting patterns, clever solutions, architecture decisions, or optimizations that would make great technical content.
${contextBlock}
Files:
${filesText}

IMPORTANT RULES for finding gems:
- Look for patterns where the USAGE is beautiful/simple but the IMPLEMENTATION is clever
- Find the real-world problem this code solved (not a textbook explanation)
- Extract BOTH the implementation code AND how it's actually called/used
- Think: "What would make another developer stop scrolling and say 'I need this'?"

Find 2-4 gems. Return a JSON object with this EXACT structure (use these exact camelCase key names):
{
  "gems": [
    {
      "repoName": "${repoName}",
      "filePath": "path/to/file.swift",
      "gemType": "pattern",
      "title": "Short descriptive title",
      "description": "What this code does",
      "codeSnippet": "the implementation/definition code",
      "usageExample": "how this is actually USED in the codebase — the call site, the API consumer sees. If not visible in the files, write the most natural usage based on the API design",
      "realProblem": "The actual pain point this solved — use the BUSINESS CONTEXT above. Think about real users, marketers, QA teams, not just developers. Not 'better code organization' but 'our marketing team couldn't retarget purchase events because we were using custom event names instead of Firebase's standard purchase event'. Connect code to business outcomes.",
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

    // 4500 tokens of headroom for up to 4 gems × ~1000 tokens each
    // (each gem carries codeSnippet, usageExample, realProblem, plus
    // ~6 other prose fields). 2500 was tight enough that gems with
    // long real-world Bond code routinely got truncated mid-JSON.
    const result = await this.analyze(prompt, CodeGemsAnalysisSchema, { maxTokens: 4500 });
    return result.data;
  }
}
