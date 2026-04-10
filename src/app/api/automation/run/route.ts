import { NextRequest, NextResponse } from "next/server";
import { logRunStart, logRunEnd, markRunNotified } from "@/lib/db";
import { getAgentBus } from "@/agents/base/agent-bus";
import { JobMatcherAIAgent } from "@/agents/ai/job-matcher-ai-agent";
import { ResumeAIAgent } from "@/agents/ai/resume-ai-agent";
import { ContentAIAgent } from "@/agents/ai/content-ai-agent";
import { GitHubAIAgent } from "@/agents/ai/github-ai-agent";
import { LinkedInAIAgent } from "@/agents/ai/linkedin-ai-agent";
import type { AIAgent } from "@/agents/base/ai-agent";

// Lazily initialized AI agents for API route
let agents: Map<string, AIAgent> | null = null;

function getAgents(): Map<string, AIAgent> {
  if (agents) return agents;

  const bus = getAgentBus();
  agents = new Map();
  agents.set("job-matcher", new JobMatcherAIAgent(bus));
  agents.set("resume", new ResumeAIAgent(bus));
  agents.set("content", new ContentAIAgent(bus));
  agents.set("github", new GitHubAIAgent(bus));
  agents.set("linkedin", new LinkedInAIAgent(bus));
  return agents;
}

// Map schedule IDs to agent + mode
const MODE_MAP: Record<string, { agentKey: string; mode?: string }> = {
  "job-matcher": { agentKey: "job-matcher" },
  "content": { agentKey: "content" },
  "github": { agentKey: "github" },
  "linkedin": { agentKey: "linkedin" },
  "resume": { agentKey: "resume" },
  "issue-hunter": { agentKey: "github", mode: "issue-hunter" },
  "pr-tracker": { agentKey: "github", mode: "pr-tracker" },
  "code-gems": { agentKey: "content", mode: "code-gems" },
  "github-report": { agentKey: "github", mode: "weekly-report" },
};

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { agentId } = body;

  if (!agentId) {
    return NextResponse.json({ error: "agentId required" }, { status: 400 });
  }

  const mapping = MODE_MAP[agentId];
  if (!mapping) {
    return NextResponse.json({ error: `Unknown agent: ${agentId}` }, { status: 400 });
  }

  const runId = logRunStart(agentId);

  try {
    const allAgents = getAgents();
    const agent = allAgents.get(mapping.agentKey);

    if (!agent) {
      throw new Error(`Agent "${mapping.agentKey}" not found`);
    }

    const context: Record<string, unknown> = { runId };
    if (mapping.mode) {
      context.mode = mapping.mode;
    }

    console.log(`[API] Running ${agentId}${mapping.mode ? ` (mode: ${mapping.mode})` : ""}`);
    const result = await agent.run(context);

    markRunNotified(runId);
    logRunEnd(runId, "success", result.findings.length, result.actionItems.length);

    return NextResponse.json({
      success: true,
      runId,
      findings: result.findings.length,
      actions: result.actionItems.length,
      message: `${result.findings.length} findings, ${result.actionItems.length} action items`,
      details: result.findings.slice(0, 5).map((f) => f.title),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logRunEnd(runId, "error", 0, 0, msg);
    return NextResponse.json({ error: msg, runId }, { status: 500 });
  }
}
