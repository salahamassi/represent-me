/**
 * Scheduler v3 — AI-powered agent orchestration with event bus.
 * Falls back to static agents when Claude API is not configured.
 */

import * as cron from "node-cron";
import {
  getScheduleConfigs,
  updateScheduleConfig,
  logRunStart,
  logRunEnd,
  markRunNotified,
  updateJobAction,
  updateContentAction,
  getContentById,
} from "./db";
import * as telegram from "./telegram";
import { publishContentRow } from "@/services/zernio-service";
import { formatSlotHuman } from "./posting-schedule";
import { getAgentBus } from "@/agents/base/agent-bus";
import { JobMatcherAIAgent } from "@/agents/ai/job-matcher-ai-agent";
import { ResumeAIAgent } from "@/agents/ai/resume-ai-agent";
import { ContentAIAgent } from "@/agents/ai/content-ai-agent";
import { GitHubAIAgent } from "@/agents/ai/github-ai-agent";
import { LinkedInAIAgent } from "@/agents/ai/linkedin-ai-agent";
import { BureaucratAIAgent } from "@/agents/ai/bureaucrat-ai-agent";
import type { AIAgent } from "@/agents/base/ai-agent";

const activeTasks: Map<string, ReturnType<typeof cron.schedule>> = new Map();

// AI agent instances (initialized once)
let aiAgents: Map<string, AIAgent> = new Map();
let isAIMode = false;

export function startScheduler() {
  console.log("[Scheduler] Starting v3...");

  // Initialize event bus and AI agents
  const bus = getAgentBus();
  isAIMode = !!process.env.ANTHROPIC_API_KEY;

  if (isAIMode) {
    console.log("[Scheduler] AI mode enabled — all agents powered by Claude");

    // Create AI agent instances — they register their event listeners in constructors
    aiAgents.set("job-matcher", new JobMatcherAIAgent(bus));
    aiAgents.set("resume", new ResumeAIAgent(bus));
    aiAgents.set("content", new ContentAIAgent(bus));
    aiAgents.set("github", new GitHubAIAgent(bus));
    aiAgents.set("linkedin", new LinkedInAIAgent(bus));
    // Bureaucrat subscribes to `job:high-fit` in its constructor; it
    // runs entirely event-driven so we instantiate but never schedule.
    aiAgents.set("bureaucrat", new BureaucratAIAgent(bus));
  } else {
    console.log("[Scheduler] Static mode — no API key, using rule-based agents");
  }

  // Load schedule configs and register cron jobs
  const configs = getScheduleConfigs() as {
    agent_id: string;
    cron_expression: string;
    enabled: number;
  }[];

  for (const config of configs) {
    if (config.enabled) {
      scheduleAgent(config.agent_id, config.cron_expression);
    }
  }

  // Poll Telegram callbacks every 30 seconds
  cron.schedule("*/30 * * * * *", async () => {
    await processTelegramCallbacks();
  });

  // Send startup message
  telegram.sendTestMessage().then((sent) => {
    if (sent) console.log("[Scheduler] Telegram startup message sent");
    else console.log("[Scheduler] Telegram not configured or failed");
  });

  console.log(`[Scheduler] Ready. Mode: ${isAIMode ? "AI" : "Static"}. Active jobs: ${activeTasks.size}`);
}

function scheduleAgent(agentId: string, cronExpr: string) {
  const existing = activeTasks.get(agentId);
  if (existing) existing.stop();

  if (!cron.validate(cronExpr)) {
    console.error(`[Scheduler] Invalid cron for ${agentId}: ${cronExpr}`);
    return;
  }

  const task = cron.schedule(cronExpr, () => {
    console.log(`[Scheduler] Running ${agentId}...`);
    runAgentJob(agentId);
  });

  activeTasks.set(agentId, task);
  console.log(`[Scheduler] Scheduled ${agentId}: ${cronExpr}`);
}

export function reschedule(agentId: string, cronExpr: string) {
  updateScheduleConfig(agentId, { cron_expression: cronExpr });
  scheduleAgent(agentId, cronExpr);
}

export function toggleSchedule(agentId: string, enabled: boolean) {
  updateScheduleConfig(agentId, { enabled: enabled ? 1 : 0 });

  if (enabled) {
    const configs = getScheduleConfigs() as {
      agent_id: string;
      cron_expression: string;
    }[];
    const config = configs.find((c) => c.agent_id === agentId);
    if (config) scheduleAgent(agentId, config.cron_expression);
  } else {
    const existing = activeTasks.get(agentId);
    if (existing) {
      existing.stop();
      activeTasks.delete(agentId);
    }
  }
}

async function runAgentJob(agentId: string) {
  const runId = logRunStart(agentId);

  try {
    if (isAIMode) {
      await runAIAgent(agentId, runId);
    } else {
      await runStaticAgent(agentId, runId);
    }

    updateScheduleConfig(agentId, {
      last_run_at: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logRunEnd(runId, "error", 0, 0, msg);
    console.error(`[Scheduler] ${agentId} failed:`, msg);
  }
}

// --- AI Mode ---

async function runAIAgent(agentId: string, runId: number) {
  let agent = aiAgents.get(agentId);
  let context: Record<string, unknown> = { runId };

  // Map virtual schedule IDs to agent instances with modes
  switch (agentId) {
    case "issue-hunter":
      agent = aiAgents.get("github");
      context.mode = "issue-hunter";
      break;
    case "pr-tracker":
      agent = aiAgents.get("github");
      context.mode = "pr-tracker";
      break;
    case "code-gems":
      agent = aiAgents.get("content");
      context.mode = "code-gems";
      break;
    case "github-report":
      agent = aiAgents.get("github");
      context.mode = "weekly-report";
      break;
  }

  if (!agent) {
    throw new Error(`No AI agent registered for ${agentId}`);
  }

  console.log(`[Scheduler] Running AI agent: ${agentId}${context.mode ? ` (mode: ${context.mode})` : ""}`);
  const result = await agent.run(context);

  markRunNotified(runId);
  logRunEnd(runId, "success", result.findings.length, result.actionItems.length);
}

// --- Static Fallback Mode ---

async function runStaticAgent(agentId: string, runId: number) {
  switch (agentId) {
    case "job-matcher": {
      const { fetchRemoteOKJobs } = await import("@/services/remoteok-service");
      const { calculateFit } = await import("@/agents/job-matcher-agent");
      const { isJobSeen, markJobSeen } = await import("./db");

      const { jobs } = await fetchRemoteOKJobs();
      let newCount = 0;

      for (const job of jobs) {
        if (isJobSeen(job.id)) continue;
        const match = calculateFit(job as Parameters<typeof calculateFit>[0]);
        if (match.fitPercentage >= 50) {
          markJobSeen({
            id: job.id, source: "remoteok", title: job.title, company: job.company,
            url: `https://remoteok.com/remote-jobs/${job.id.replace("remoteok-", "")}`,
            fitPercentage: match.fitPercentage,
            matchedSkills: match.matchedSkills, missingSkills: match.missingSkills,
          });
          newCount++;
        }
      }

      logRunEnd(runId, "success", newCount, 0);
      break;
    }

    case "content": {
      const { ARTICLE_SUGGESTIONS } = await import("@/agents/content-agent");
      const { generateLinkedInPost } = await import("@/services/claude-service");
      const { insertGeneratedContent } = await import("./db");

      const suggestion = ARTICLE_SUGGESTIONS[Math.floor(Math.random() * ARTICLE_SUGGESTIONS.length)];
      const draft = await generateLinkedInPost(suggestion);
      const contentId = insertGeneratedContent("linkedin_post", draft, suggestion.id);
      await telegram.sendContentDraft(draft, contentId, suggestion.title);
      markRunNotified(runId);
      logRunEnd(runId, "success", 1, 1);
      break;
    }

    case "github": {
      const { getRecentActivity } = await import("@/services/github-api-service");
      const activity = await getRecentActivity();
      await telegram.sendAgentSummary("GitHub Agent", activity.highlights.length, activity.highlights);
      markRunNotified(runId);
      logRunEnd(runId, "success", activity.highlights.length, 0);
      break;
    }

    case "linkedin": {
      const { run } = await import("@/agents/linkedin-agent");
      const result = await run();
      const highlights = result.findings.filter((f) => f.severity === "critical" || f.severity === "warning").slice(0, 3).map((f) => f.title);
      if (highlights.length > 0) {
        await telegram.sendAgentSummary("LinkedIn Agent", result.findings.length, highlights);
        markRunNotified(runId);
      }
      logRunEnd(runId, "success", result.findings.length, result.actionItems.length);
      break;
    }

    case "resume": {
      const { run } = await import("@/agents/resume-agent");
      const result = await run();
      logRunEnd(runId, "success", result.findings.length, result.actionItems.length);
      break;
    }

    default:
      throw new Error(`Unknown agent: ${agentId}`);
  }
}

// --- Telegram Callbacks ---

async function processTelegramCallbacks() {
  const callbacks = await telegram.pollUpdates();
  const bus = getAgentBus();

  for (const cb of callbacks) {
    switch (cb.type) {
      case "apply":
        updateJobAction(cb.id, "apply_later");
        // In AI mode, trigger resume generation via event bus
        if (isAIMode) {
          await bus.publish("telegram:user-action", "telegram", {
            type: "apply",
            id: cb.id,
          });
        } else {
          await telegram.sendMessage(`Marked "${cb.id}" for application. Good luck!`);
        }
        break;
      case "dismiss":
        updateJobAction(cb.id, "dismissed");
        break;
      case "content_approve":
        updateContentAction(parseInt(cb.id), "approved");
        await autoPostToLinkedIn(parseInt(cb.id), "Post");
        break;
      case "content_reject":
        updateContentAction(parseInt(cb.id), "rejected");
        break;

      // --- Issue Hunter callbacks ---
      case "issue_interested": {
        const { updateContributionStatus: updateCS } = await import("./db");
        updateCS(parseInt(cb.id), "working");
        await bus.publish("issue:user-interested", "telegram", { contributionId: parseInt(cb.id) });
        await telegram.sendMessage("Tracking your progress. I'll check for your PR periodically!");
        break;
      }
      case "issue_dismiss": {
        const { updateContributionStatus: updateCS2 } = await import("./db");
        updateCS2(parseInt(cb.id), "dismissed");
        break;
      }
      case "issue_later":
        // Keep status as "notified"
        break;

      // --- Code Gems callbacks ---
      case "gem_approve":
        updateContentAction(parseInt(cb.id), "approved");
        await autoPostToLinkedIn(parseInt(cb.id), "Code gem");
        break;
      case "gem_reject":
        updateContentAction(parseInt(cb.id), "rejected");
        break;
    }
  }
}

/**
 * Telegram-approve handler: publish via Zernio and message the user with the
 * result. On success the row is flipped to `published` (inside
 * publishContentRow); on failure it stays `approved` and we ship the post
 * text back to Telegram so the user can paste manually.
 */
async function autoPostToLinkedIn(
  contentId: number,
  label: "Post" | "Code gem"
): Promise<void> {
  const result = await publishContentRow(contentId);

  if (result.ok) {
    if (result.scheduledAt) {
      const when = formatSlotHuman(new Date(result.scheduledAt));
      await telegram.sendMessage(
        `📅 ${label} scheduled for LinkedIn at ${when}.\n\nSet to hit peak engagement — we can "post now anyway" from the web UI if you want to override.`
      );
    } else {
      const urlLine = result.url ? `\n${result.url}` : "";
      await telegram.sendMessage(`✅ ${label} published on LinkedIn!${urlLine}`);
    }
    return;
  }

  // Fallback: include the post text so the user can paste manually. Cap to
  // stay under Telegram's 4096-char limit.
  const content = getContentById(contentId);
  const body = content?.generated_text || "";
  const trimmed = body.length > 3500 ? body.slice(0, 3500) + "…" : body;
  await telegram.sendMessage(
    `⚠️ Auto-post failed: ${result.error || "unknown error"}\n\nPaste this on LinkedIn manually:\n\n${trimmed}`
  );
}

// Export for manual triggering from API routes
export { runAgentJob };
