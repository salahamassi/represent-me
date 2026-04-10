/**
 * AI LinkedIn Agent — Uses Claude to optimize LinkedIn profile and content strategy.
 * Can incorporate job market insights from Job Matcher.
 */

import { AIAgent, type AIAgentConfig } from "../base/ai-agent";
import type { AgentBus } from "../base/agent-bus";
import { LinkedInAnalysisSchema } from "../schemas/linkedin.schema";
import * as telegram from "@/lib/telegram";
import type { AgentResult, Finding, ActionItem } from "@/types";

export class LinkedInAIAgent extends AIAgent {
  constructor(bus: AgentBus) {
    const config: AIAgentConfig = {
      id: "linkedin",
      name: "AI LinkedIn Agent",
      systemPrompt: "",
      temperature: 0.5,
      maxTokens: 2500,
    };
    super(config, bus);

    this.config.systemPrompt = `You are a LinkedIn profile optimization expert for tech professionals.

You are optimizing the LinkedIn presence of:
${this.getProfileContext()}

Your task: Generate optimized profile sections and a content calendar.
Rules:
- Headline should be keyword-rich and compelling (not just job title)
- About section should tell a story, not list skills
- Featured items should showcase best work
- Keywords should align with current mobile dev job market
- Content calendar should build thought leadership
- Be specific and actionable, not generic`;
  }

  async run(context?: Record<string, unknown>): Promise<AgentResult> {
    this.currentRunId = context?.runId as number | undefined;
    const findings: Finding[] = [];
    const actionItems: ActionItem[] = [];

    try {
      const prompt = `Generate a complete LinkedIn optimization strategy.

Note: I can't access the actual LinkedIn profile, so generate recommendations based on the resume data provided.

Return JSON with:
- optimizedHeadline: compelling headline (under 120 chars)
- optimizedAbout: 3-paragraph about section
- featuredItems: 4-5 items to feature (articles, repos, projects) with reason
- keywordRecommendations: 10-15 keywords with importance level and reason
- contentCalendar: 4-week plan with topic, type (post/article/share/poll), and brief
- overallScore: estimated LinkedIn presence score 0-100 based on resume`;

      const result = await this.analyze(prompt, LinkedInAnalysisSchema);
      const analysis = result.data;

      // Profile optimization findings
      findings.push({
        id: "linkedin-headline",
        agentId: "linkedin",
        severity: "critical",
        title: "Optimized Headline",
        description: analysis.optimizedHeadline,
        category: "headline",
      });

      findings.push({
        id: "linkedin-about",
        agentId: "linkedin",
        severity: "warning",
        title: "Optimized About Section",
        description: analysis.optimizedAbout.slice(0, 200) + "...",
        category: "about",
        evidence: analysis.optimizedAbout,
      });

      findings.push({
        id: "linkedin-score",
        agentId: "linkedin",
        severity: analysis.overallScore >= 60 ? "positive" : "warning",
        title: `LinkedIn Presence Score: ${analysis.overallScore}/100`,
        description: `Based on resume analysis. ${analysis.keywordRecommendations.filter((k) => k.importance === "critical").length} critical keywords identified.`,
        category: "score",
      });

      // Featured items
      for (const item of analysis.featuredItems) {
        actionItems.push({
          id: `feature-${item.title.slice(0, 20).replace(/\s/g, "-")}`,
          agentId: "linkedin",
          priority: "high",
          effort: "quick",
          title: `Feature: ${item.title}`,
          description: `Type: ${item.type}. ${item.reason}`,
          completed: false,
          link: item.url,
        });
      }

      // Critical keywords
      const criticalKeywords = analysis.keywordRecommendations
        .filter((k) => k.importance === "critical")
        .map((k) => k.keyword);

      if (criticalKeywords.length > 0) {
        actionItems.push({
          id: "linkedin-keywords",
          agentId: "linkedin",
          priority: "high",
          effort: "quick",
          title: `Add critical keywords: ${criticalKeywords.join(", ")}`,
          description: "These keywords are essential for appearing in recruiter searches",
          completed: false,
        });
      }

      // Content calendar as action items
      for (const week of analysis.contentCalendar.slice(0, 4)) {
        actionItems.push({
          id: `calendar-week-${week.week}`,
          agentId: "linkedin",
          priority: "medium",
          effort: "moderate",
          title: `Week ${week.week}: ${week.type} — ${week.topic}`,
          description: week.brief,
          completed: false,
        });
      }

      // Notify via Telegram
      const highlights = [
        `Headline: ${analysis.optimizedHeadline}`,
        `Score: ${analysis.overallScore}/100`,
        `${criticalKeywords.length} critical keywords to add`,
        `4-week content plan ready`,
      ];
      await telegram.sendAgentSummary("AI LinkedIn Agent", findings.length, highlights);

      // Publish for other agents
      await this.bus.publish("linkedin:analysis-complete", "linkedin", {
        score: analysis.overallScore,
        headline: analysis.optimizedHeadline,
        keywords: analysis.keywordRecommendations,
      });

    } catch (err) {
      console.error("[AI LinkedIn] Error:", err);
      findings.push({
        id: "linkedin-error",
        agentId: "linkedin",
        severity: "critical",
        title: "LinkedIn analysis failed",
        description: err instanceof Error ? err.message : String(err),
        category: "error",
      });
    }

    return { findings, actionItems };
  }
}
