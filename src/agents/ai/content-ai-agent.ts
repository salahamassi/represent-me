/**
 * AI Content Agent — Multi-mode agent:
 * - "weekly": Generate LinkedIn posts and article ideas (original)
 * - "code-gems": Mine gems from user's repos, generate content
 * Also responds to contribution lifecycle events (PR opened/merged).
 */

import { AIAgent, type AIAgentConfig } from "../base/ai-agent";
import type { AgentBus } from "../base/agent-bus";
import { ContentGenerationSchema } from "../schemas/content.schema";
import { ContributionContentSchema, type ContributionContent } from "../schemas/contribution-content.schema";
import type { CodeGemsAnalysis } from "../schemas/code-gems.schema";
import { mediumArticles } from "@/data/medium-data";
import {
  insertGeneratedContent,
  insertCodeGem,
  updateCodeGemContent,
  markContributionContentGenerated,
  getContributionById,
} from "@/lib/db";
import * as telegram from "@/lib/telegram";
import type { AgentResult, Finding, ActionItem, OSSContribution } from "@/types";

// User's notable repos for code gems mining (gold mine repos)
const NOTABLE_REPOS = [
  { owner: "devmatrash", repo: "trivia", branch: "develop" },
  { owner: "winchsa", repo: "ios-app", branch: "master" },
  { owner: "onestudio-co", repo: "bond-core", branch: "main" },
];

export class ContentAIAgent extends AIAgent {
  private recentGitHubInsights: string[] = [];

  constructor(bus: AgentBus) {
    const config: AIAgentConfig = {
      id: "content",
      name: "AI Content Agent",
      systemPrompt: "",
      temperature: 0.7,
      maxTokens: 2500,
    };
    super(config, bus);

    const existingArticles = mediumArticles
      .map((a) => `- "${a.title}" (${a.tags.join(", ")})`)
      .join("\n");

    this.config.systemPrompt = `You are a technical content strategist for mobile developers.

You are creating content for:
${this.getProfileContext()}

Their existing articles:
${existingArticles}

Rules:
- Write in first person, authentic voice
- LinkedIn posts: 200-300 words, hook first line, end with question/CTA
- Medium articles: well-structured with sections, code examples, practical takeaways
- Dev.to: cross-post-friendly format with tags
- Build on their REAL expertise, not generic advice`;

    // Listen for GitHub insights
    this.bus.subscribe("github:analysis-complete", (event) => {
      const data = event.payload as { highlights?: string[] };
      if (data.highlights) this.recentGitHubInsights = data.highlights;
    });

    // Listen for PR opened → generate LinkedIn post
    this.bus.subscribe("issue:pr-opened", async (event) => {
      const data = event.payload as { contributionId: number; contribution: OSSContribution; prUrl: string };
      console.log(`[Content] PR opened for contribution ${data.contributionId} — generating LinkedIn post`);
      await this.generateContributionContent("pr_opened", data);
    });

    // Listen for PR merged → generate full content suite
    this.bus.subscribe("issue:pr-merged", async (event) => {
      const data = event.payload as { contributionId: number; contribution: OSSContribution; prUrl: string };
      console.log(`[Content] PR merged for contribution ${data.contributionId} — generating full content suite`);
      await this.generateContributionContent("pr_merged", data);
    });
  }

  async run(context?: Record<string, unknown>): Promise<AgentResult> {
    this.currentRunId = context?.runId as number | undefined;
    const mode = (context?.mode as string) || "weekly";

    switch (mode) {
      case "code-gems":
        return this.runCodeGemsMining();
      default:
        return this.runWeeklyContent();
    }
  }

  // ===== MODE: Weekly Content (original) =====

  private async runWeeklyContent(): Promise<AgentResult> {
    const findings: Finding[] = [];
    const actionItems: ActionItem[] = [];

    try {
      const extraContext = this.recentGitHubInsights.length > 0
        ? `\n\nRecent GitHub activity:\n${this.recentGitHubInsights.join("\n")}`
        : "";

      const prompt = `Generate content strategy for this week.${extraContext}

Return JSON with articleIdeas (3-5), linkedInPost (ready to post), trendingTopics, contentGaps.`;

      const result = await this.analyze(prompt, ContentGenerationSchema);
      const content = result.data;

      const contentId = insertGeneratedContent("linkedin_post", content.linkedInPost.content, "ai-weekly");
      await telegram.sendContentDraft(content.linkedInPost.content, contentId, content.linkedInPost.hook);

      findings.push({
        id: "content-post-ready", agentId: "content", severity: "positive",
        title: "LinkedIn post draft ready", description: content.linkedInPost.hook, category: "content",
      });

      for (const idea of content.articleIdeas) {
        findings.push({
          id: `article-${idea.title.slice(0, 20).replace(/\s/g, "-")}`, agentId: "content", severity: "info",
          title: idea.title,
          description: `${idea.targetPlatform} | ${idea.difficulty} | ${idea.estimatedReadTime} — ${idea.rationale}`,
          category: "article-idea",
        });
      }

      for (const gap of content.contentGaps) {
        actionItems.push({
          id: `gap-${gap.slice(0, 20).replace(/\s/g, "-")}`, agentId: "content",
          priority: "medium", effort: "moderate",
          title: `Write about: ${gap}`, description: "Content portfolio gap", completed: false,
        });
      }

      await this.bus.publish("content:draft-ready", "content", { post: content.linkedInPost, ideas: content.articleIdeas });

    } catch (err) {
      console.error("[AI Content] Error:", err);
      findings.push({
        id: "content-error", agentId: "content", severity: "critical",
        title: "Content generation failed",
        description: err instanceof Error ? err.message : String(err), category: "error",
      });
    }

    return { findings, actionItems };
  }

  // ===== Contribution Content (event-driven) =====

  private async generateContributionContent(
    eventType: "pr_opened" | "pr_merged",
    data: { contributionId: number; contribution: OSSContribution; prUrl: string }
  ) {
    const { contribution, prUrl } = data;
    const analysis = contribution.ai_analysis ? JSON.parse(contribution.ai_analysis) : null;

    try {
      if (eventType === "pr_opened") {
        // LinkedIn post only
        const prompt = `Generate a LinkedIn post announcing this open-source contribution:

Repository: ${contribution.repo_owner}/${contribution.repo_name}
Issue: "${contribution.issue_title}" (#${contribution.issue_number})
PR URL: ${prUrl}
${analysis ? `Approach: ${analysis.approachSummary}` : ""}

Write an authentic, first-person LinkedIn post (200-300 words).
Focus on: what you learned, why you contributed, community value.
DO NOT generate mediumArticle or devtoArticle — only linkedInPost.`;

        const result = await this.analyze(prompt, ContributionContentSchema);
        const contentId = insertGeneratedContent(
          "contribution_linkedin_post",
          result.data.linkedInPost.content,
          `contrib-${data.contributionId}`
        );

        await telegram.sendContentDraft(
          result.data.linkedInPost.content,
          contentId,
          `Contribution: ${contribution.issue_title}`
        );

        markContributionContentGenerated(data.contributionId);

      } else if (eventType === "pr_merged") {
        // Full content suite: LinkedIn + Medium + Dev.to
        const prompt = `Generate a complete content suite for this MERGED open-source contribution:

Repository: ${contribution.repo_owner}/${contribution.repo_name}
Issue: "${contribution.issue_title}" (#${contribution.issue_number})
PR URL: ${prUrl}
${analysis ? `
Issue type: ${analysis.issueType}
Difficulty: ${analysis.difficulty}
Approach: ${analysis.approachSummary}
Steps taken: ${analysis.approachSteps?.join(", ") || "N/A"}
What was learned: ${analysis.learningValue}
` : ""}

Generate ALL THREE:
1. linkedInPost: Celebration post (200-300 words), authentic first-person
2. mediumArticle: Technical article with sections (problem, approach, solution, takeaways), code examples encouraged
3. devtoArticle: Cross-post format with tags, SEO-friendly title`;

        const result = await this.analyze(prompt, ContributionContentSchema, { maxTokens: 4000 });

        // Save LinkedIn post
        const linkedInId = insertGeneratedContent(
          "contribution_linkedin_post",
          result.data.linkedInPost.content,
          `contrib-merged-${data.contributionId}`
        );

        await telegram.sendContentDraft(
          result.data.linkedInPost.content,
          linkedInId,
          `PR Merged: ${contribution.issue_title}`
        );

        // Save Medium article
        if (result.data.mediumArticle) {
          const articleContent = result.data.mediumArticle.sections
            .map((s) => `## ${s.heading}\n\n${s.content}`)
            .join("\n\n");

          insertGeneratedContent(
            "contribution_medium_article",
            `# ${result.data.mediumArticle.title}\n\n${articleContent}`,
            `contrib-merged-${data.contributionId}`
          );

          await telegram.sendMessage(
            `<b>📝 Medium article drafted:</b> "${result.data.mediumArticle.title}"\nTags: ${result.data.mediumArticle.tags.join(", ")}\n\nCheck the Content page for the full article.`
          );
        }

        // Save Dev.to article
        if (result.data.devtoArticle) {
          insertGeneratedContent(
            "contribution_devto_article",
            result.data.devtoArticle.content,
            `contrib-merged-${data.contributionId}`
          );
        }

        markContributionContentGenerated(data.contributionId);
      }

    } catch (err) {
      console.error("[Content] Contribution content error:", err);
      await telegram.sendMessage(`Failed to generate content for ${contribution.issue_title}: ${err}`);
    }
  }

  // ===== MODE: Code Gems Mining =====

  private async runCodeGemsMining(): Promise<AgentResult> {
    const findings: Finding[] = [];
    const actionItems: ActionItem[] = [];

    try {
      // Pick 2-3 repos to analyze this run (rotate)
      const shuffled = [...NOTABLE_REPOS].sort(() => Math.random() - 0.5);
      const reposToAnalyze = shuffled.slice(0, 3);

      this.logStep("fetch", `Mining repos: ${reposToAnalyze.map(r => `${r.owner}/${r.repo}`).join(", ")}`, { repos: reposToAnalyze });

      for (const { owner, repo, branch } of reposToAnalyze) {
        const repoName = `${owner}/${repo}`;
        try {
          // Request gem analysis from GitHub Agent via event bus
          const analysis = await this.bus.request<CodeGemsAnalysis>(
            "github:analyze-repo",
            { owner, repo, branch },
            90000 // 90s timeout for repo analysis
          );

          if (!analysis.gems || analysis.gems.length === 0) {
            console.log(`[CodeGems] No gems found in ${repoName}`);
            continue;
          }

          this.logStep("generate", `Found ${analysis.gems.length} gems in ${repoName}`, { gemCount: analysis.gems.length, repoName });

          for (const gem of analysis.gems) {
            // Save to DB
            const gemId = insertCodeGem({
              repoName: gem.repoName,
              filePath: gem.filePath,
              gemType: gem.gemType,
              title: gem.title,
              description: gem.description,
              codeSnippet: gem.codeSnippet,
              aiAnalysis: JSON.stringify(gem),
            });

            findings.push({
              id: `gem-${gemId}`, agentId: "content", severity: "positive",
              title: `💎 ${gem.title}`,
              description: `${gem.repoName}/${gem.filePath} — ${gem.whyInteresting}`,
              category: "code-gem",
            });

            // Generate content for top gems
            if (gem.suggestedPlatform) {
              try {
                const contentPrompt = `Turn this code gem into a ${gem.suggestedPlatform} post:

Gem: ${gem.title}
Repo: ${gem.repoName}
File: ${gem.filePath}
Type: ${gem.gemType}
Why interesting: ${gem.whyInteresting}
Content angle: ${gem.contentAngle}
Code snippet:
\`\`\`
${gem.codeSnippet}
\`\`\`

Suggested title: "${gem.suggestedTitle}"

Write the post content. ${gem.suggestedPlatform === "linkedin" ? "200-300 words, first person, hook first." : "Include code examples, practical takeaways. 800-1200 words."}

Return JSON with this EXACT structure:
{
  "linkedInPost": {
    "content": "the full post text",
    "hook": "the attention-grabbing first line",
    "callToAction": "ending question or CTA"
  }
}`;

                // Use ContributionContentSchema which only requires linkedInPost
                const contentResult = await this.analyze(contentPrompt, ContributionContentSchema, { maxTokens: 2000 });

                const contentId = insertGeneratedContent(
                  `gem_${gem.suggestedPlatform}_post`,
                  contentResult.data.linkedInPost.content,
                  `gem-${gemId}`
                );

                updateCodeGemContent(gemId, contentId);

                await telegram.sendCodeGemDraft(
                  { title: gem.title, repoName: gem.repoName, gemType: gem.gemType },
                  contentResult.data.linkedInPost.content,
                  contentId
                );

              } catch (err) {
                console.error(`[CodeGems] Content generation failed for gem "${gem.title}":`, err);
              }
            }
          }

        } catch (err) {
          console.error(`[CodeGems] Failed to analyze ${repoName}:`, err);
        }
      }

    } catch (err) {
      console.error("[CodeGems] Error:", err);
    }

    return { findings, actionItems };
  }
}
