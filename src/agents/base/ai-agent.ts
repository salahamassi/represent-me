/**
 * AI Agent Base Class — Shared foundation for all AI-powered agents.
 * Provides: Claude client, structured analysis via Zod, cost tracking, retry, activity logging.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { profile } from "@/data/profile";
import { logAIUsage, logActivity } from "@/lib/db";
import * as telegram from "@/lib/telegram";
import type { AgentBus } from "./agent-bus";
import type { AgentResult } from "@/types";

/** Classify an error from the Anthropic API */
export interface ClaudeApiError {
  type: "credit" | "rate_limit" | "auth" | "overloaded" | "network" | "unknown";
  message: string;
  status?: number;
  shouldRetry: boolean;
}

export function classifyClaudeError(err: unknown): ClaudeApiError {
  const errorObj = err as { status?: number; message?: string; error?: { type?: string; message?: string } };
  const status = errorObj?.status;
  const message = errorObj?.message || errorObj?.error?.message || String(err);
  const lower = message.toLowerCase();

  // 401 / auth issues
  if (status === 401 || lower.includes("invalid api key") || lower.includes("authentication")) {
    return { type: "auth", message, status, shouldRetry: false };
  }
  // 402 / credit / billing — don't retry
  if (status === 402 || lower.includes("credit") || lower.includes("billing") || lower.includes("insufficient") || lower.includes("quota")) {
    return { type: "credit", message, status, shouldRetry: false };
  }
  // 429 — rate limit, retry
  if (status === 429 || lower.includes("rate limit")) {
    return { type: "rate_limit", message, status, shouldRetry: true };
  }
  // 529 — overloaded, retry
  if (status === 529 || lower.includes("overloaded")) {
    return { type: "overloaded", message, status, shouldRetry: true };
  }
  // Network errors — retry
  if (lower.includes("econnreset") || lower.includes("etimedout") || lower.includes("fetch failed")) {
    return { type: "network", message, status, shouldRetry: true };
  }
  return { type: "unknown", message, status, shouldRetry: true };
}

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

// Per-MTok pricing table (input / output). Extend as new models are added.
const PRICING = {
  "claude-sonnet-4-20250514": { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  "claude-haiku-4-5-20251001": { input: 1 / 1_000_000, output: 5 / 1_000_000 },
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
    options?: { temperature?: number; maxTokens?: number; runId?: number; model?: string; systemOverride?: string }
  ): Promise<AIAnalysisResult<T>> {
    if (!this.client) {
      throw new Error(`[${this.config.name}] Claude API not configured (missing ANTHROPIC_API_KEY)`);
    }

    const start = Date.now();
    const model = options?.model || this.config.model || "claude-sonnet-4-20250514";

    const systemPrompt = (options?.systemOverride ?? this.config.systemPrompt) + `

IMPORTANT: Respond ONLY with valid JSON matching the requested schema. No markdown, no code blocks, no explanation text. Just the JSON object.`;

    let message;
    try {
      message = await this.withRetry(async () => {
        return this.client!.messages.create({
          model,
          max_tokens: options?.maxTokens || this.config.maxTokens || 2000,
          temperature: options?.temperature ?? this.config.temperature ?? 0.3,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        });
      });
    } catch (err) {
      // Classify and log the error properly
      const classified = classifyClaudeError(err);
      this.logStep("error", `Claude API error: ${classified.type}`, {
        errorType: classified.type,
        status: classified.status,
        message: classified.message.slice(0, 300),
      });

      // Send Telegram alert for non-retryable errors (credit, auth)
      if (classified.type === "credit" || classified.type === "auth") {
        const emoji = classified.type === "credit" ? "💳" : "🔑";
        const heading = classified.type === "credit" ? "Out of Claude credits" : "Claude API key issue";
        try {
          await telegram.sendMessage(
            `${emoji} <b>${heading}</b>\n\n` +
            `Agent: ${this.config.name}\n` +
            `Error: ${classified.message.slice(0, 200)}\n\n` +
            `Add credits at console.anthropic.com to resume agent runs.`
          );
        } catch {
          // Telegram failure shouldn't mask the underlying error
        }
      }

      throw err;
    }

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
   * Multi-turn plain-text completion. Use for conversational flows (e.g. chat
   * refinement) where Claude should respond in free-form text rather than the
   * structured JSON envelope expected by `analyze()`.
   *
   * `priorMessages` becomes the conversation history; `userPrompt` is appended
   * as the final user turn. Cost + activity logging mirrors `analyze()`.
   */
  protected async complete(
    userPrompt: string,
    options?: {
      priorMessages?: { role: "user" | "assistant"; content: string }[];
      systemOverride?: string;
      temperature?: number;
      maxTokens?: number;
      runId?: number;
    }
  ): Promise<{ text: string; tokens: { input: number; output: number }; cost: number; durationMs: number }> {
    if (!this.client) {
      throw new Error(`[${this.config.name}] Claude API not configured (missing ANTHROPIC_API_KEY)`);
    }

    const start = Date.now();
    const model = this.config.model || "claude-sonnet-4-20250514";
    const systemPrompt = options?.systemOverride ?? this.config.systemPrompt;

    const messages = [
      ...(options?.priorMessages || []),
      { role: "user" as const, content: userPrompt },
    ];

    let message;
    try {
      message = await this.withRetry(async () => {
        return this.client!.messages.create({
          model,
          max_tokens: options?.maxTokens || this.config.maxTokens || 2000,
          temperature: options?.temperature ?? this.config.temperature ?? 0.3,
          system: systemPrompt,
          messages,
        });
      });
    } catch (err) {
      const classified = classifyClaudeError(err);
      this.logStep("error", `Claude API error: ${classified.type}`, {
        errorType: classified.type,
        status: classified.status,
        message: classified.message.slice(0, 300),
      });
      if (classified.type === "credit" || classified.type === "auth") {
        const emoji = classified.type === "credit" ? "💳" : "🔑";
        const heading = classified.type === "credit" ? "Out of Claude credits" : "Claude API key issue";
        try {
          await telegram.sendMessage(
            `${emoji} <b>${heading}</b>\n\n` +
            `Agent: ${this.config.name}\n` +
            `Error: ${classified.message.slice(0, 200)}\n\n` +
            `Add credits at console.anthropic.com to resume agent runs.`
          );
        } catch {
          // Telegram failure shouldn't mask the underlying error
        }
      }
      throw err;
    }

    const durationMs = Date.now() - start;

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error(`[${this.config.name}] No text in Claude response`);
    }
    const text = textBlock.text.trim();

    const tokens = {
      input: message.usage.input_tokens,
      output: message.usage.output_tokens,
    };
    const pricing = PRICING[model as keyof typeof PRICING] || PRICING["claude-sonnet-4-20250514"];
    const cost = tokens.input * pricing.input + tokens.output * pricing.output;

    this.totalTokens.input += tokens.input;
    this.totalTokens.output += tokens.output;
    this.totalCost += cost;

    const runId = options?.runId || this.currentRunId;
    logAIUsage(this.config.id, tokens.input, tokens.output, cost, model, durationMs, runId);

    const promptSummary = userPrompt.slice(0, 80).replace(/\n/g, " ");
    this.logStep("analyze", `Claude (chat): ${promptSummary}...`, {
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      model,
      turns: messages.length,
    }, {
      tokensUsed: tokens.input + tokens.output,
      costUsd: cost,
      durationMs,
    });

    console.log(
      `[${this.config.name}] chat ${tokens.input}+${tokens.output} tokens, $${cost.toFixed(4)}, ${durationMs}ms (${messages.length} turns)`
    );

    return { text, tokens, cost, durationMs };
  }

  /**
   * Retry with exponential backoff for transient failures.
   */
  protected async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const classified = classifyClaudeError(err);
        // Don't waste retries on non-retryable errors (credit, auth)
        if (!classified.shouldRetry) {
          console.warn(`[${this.config.name}] Non-retryable error (${classified.type}), aborting`);
          throw err;
        }
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
