/**
 * AI Agent Base Class — Shared foundation for all AI-powered agents.
 * Provides: Claude client, structured analysis via Zod, cost tracking, retry, activity logging.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { profile } from "@/data/profile";
import { logAIUsage, logActivity } from "@/lib/db";
import type { AgentBus } from "./agent-bus";
import type { AgentResult } from "@/types";

export interface AIAgentConfig {
  id: string;
  name: string;
  systemPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIAnalysisResult<T> {
  data: T;
  tokens: { input: number; output: number };
  cost: number;
  durationMs: number;
}

// Sonnet 4 pricing
const PRICING = {
  "claude-sonnet-4-20250514": { input: 3 / 1_000_000, output: 15 / 1_000_000 },
};

export abstract class AIAgent {
  protected config: AIAgentConfig;
  protected client: Anthropic | null;
  protected bus: AgentBus;
  protected currentRunId?: number;
  private totalCost = 0;
  private totalTokens = { input: 0, output: 0 };

  constructor(config: AIAgentConfig, bus: AgentBus) {
    this.config = {
      model: "claude-sonnet-4-20250514",
      maxTokens: 2000,
      temperature: 0.3,
      ...config,
    };
    this.bus = bus;
    this.client = process.env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      : null;
  }

  /**
   * Log an activity step for the current agent run.
   */
  protected logStep(
    eventType: string,
    title: string,
    detail?: Record<string, unknown>,
    extra?: { tokensUsed?: number; costUsd?: number; durationMs?: number }
  ) {
    logActivity({
      runId: this.currentRunId,
      agentId: this.config.id,
      eventType,
      title,
      detail: detail ? JSON.stringify(detail) : undefined,
      tokensUsed: extra?.tokensUsed,
      costUsd: extra?.costUsd,
      durationMs: extra?.durationMs,
    });
  }

  /**
   * Core method: Send prompt to Claude, parse structured JSON response via Zod.
   */
  protected async analyze<T>(
    userPrompt: string,
    schema: z.ZodType<T>,
    options?: { temperature?: number; maxTokens?: number; runId?: number }
  ): Promise<AIAnalysisResult<T>> {
    if (!this.client) {
      throw new Error(`[${this.config.name}] Claude API not configured (missing ANTHROPIC_API_KEY)`);
    }

    const start = Date.now();
    const model = this.config.model || "claude-sonnet-4-20250514";

    const systemPrompt = this.config.systemPrompt + `

IMPORTANT: Respond ONLY with valid JSON matching the requested schema. No markdown, no code blocks, no explanation text. Just the JSON object.`;

    const message = await this.withRetry(async () => {
      return this.client!.messages.create({
        model,
        max_tokens: options?.maxTokens || this.config.maxTokens || 2000,
        temperature: options?.temperature ?? this.config.temperature ?? 0.3,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
    });

    const durationMs = Date.now() - start;

    // Extract text from response
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error(`[${this.config.name}] No text in Claude response`);
    }

    // Parse JSON from response (handle potential markdown wrapping)
    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      this.logStep("error", `Failed to parse Claude JSON response`, { response: jsonText.slice(0, 300) });
      throw new Error(`[${this.config.name}] Failed to parse JSON: ${jsonText.slice(0, 200)}`);
    }

    // Validate with Zod
    const validated = schema.parse(parsed);

    // Track costs
    const tokens = {
      input: message.usage.input_tokens,
      output: message.usage.output_tokens,
    };
    const pricing = PRICING[model as keyof typeof PRICING] || PRICING["claude-sonnet-4-20250514"];
    const cost = tokens.input * pricing.input + tokens.output * pricing.output;

    this.totalTokens.input += tokens.input;
    this.totalTokens.output += tokens.output;
    this.totalCost += cost;

    // Log to AI usage table
    const runId = options?.runId || this.currentRunId;
    logAIUsage(this.config.id, tokens.input, tokens.output, cost, model, durationMs, runId);

    // Log to activity log
    const promptSummary = userPrompt.slice(0, 80).replace(/\n/g, " ");
    this.logStep("analyze", `Claude: ${promptSummary}...`, {
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      model,
    }, {
      tokensUsed: tokens.input + tokens.output,
      costUsd: cost,
      durationMs,
    });

    console.log(
      `[${this.config.name}] ${tokens.input}+${tokens.output} tokens, $${cost.toFixed(4)}, ${durationMs}ms`
    );

    return { data: validated, tokens, cost, durationMs };
  }

  /**
   * Retry with exponential backoff for transient failures.
   */
  protected async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (attempt === maxRetries) throw err;
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`[${this.config.name}] Retry ${attempt + 1}/${maxRetries} in ${delay}ms:`, err);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw new Error("Unreachable");
  }

  /**
   * Get the user's full profile as context string for system prompts.
   */
  protected getProfileContext(): string {
    const exp = profile.experience
      .map((e) => `${e.title} at ${e.company} (${e.period}) — ${e.technologies.join(", ")}`)
      .join("\n");

    const skills = profile.skills
      .map((s) => `${s.category}: ${s.items.join(", ")}`)
      .join("\n");

    return `
Name: ${profile.name}
Role: ${profile.role}
Location: ${profile.location}

Experience:
${exp}

Skills:
${skills}

Education: ${profile.education.map((e) => `${e.degree} from ${e.institution}`).join(", ")}

Open Source: ${profile.openSource.map((o) => o.name).join(", ")}
Publications: ${profile.publications.map((p) => p.title).join(", ")}
`;
  }

  /**
   * Get cost tracking stats.
   */
  getStats() {
    return {
      totalCost: this.totalCost,
      totalTokens: { ...this.totalTokens },
    };
  }

  /**
   * Each agent implements this.
   */
  abstract run(context?: Record<string, unknown>): Promise<AgentResult>;
}
