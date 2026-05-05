/**
 * Agents bootstrap — ONE place that constructs every AI agent and
 * attaches their subscribers to the bus singleton.
 *
 * Why: each AI agent registers its event handlers inside its constructor.
 * Historically, several routes (`/api/automation/run`, `/api/agent-bus/fire-test`,
 * `/api/manual-lead`, `src/lib/scheduler`) each instantiated their own copies
 * via their own module-level maps. Under dev-server reloads + multiple
 * route loads, that stacked duplicate subscribers on the same bus —
 * every publish fired each handler N times.
 *
 * This module is the single source of truth. Any caller that needs the
 * agents wired up calls {@link initAgents} — idempotent, safe to call
 * many times per process.
 *
 * Consumers that need the agent instances (to call `.run()`) read from
 * the exported `agents` map. Event-driven callers that just want the
 * subscribers attached to the bus can call `initAgents()` and discard
 * the return value.
 */

import { getAgentBus } from "./base/agent-bus";
import { JobMatcherAIAgent } from "./ai/job-matcher-ai-agent";
import { ResumeAIAgent } from "./ai/resume-ai-agent";
import { ContentAIAgent } from "./ai/content-ai-agent";
import { GitHubAIAgent } from "./ai/github-ai-agent";
import { LinkedInAIAgent } from "./ai/linkedin-ai-agent";
import { BureaucratAIAgent } from "./ai/bureaucrat-ai-agent";
import { GhadaAIAgent } from "./ai/ghada-ai-agent";
import type { AIAgent } from "./base/ai-agent";

let _agents: Map<string, AIAgent> | null = null;
// Bump this string when the bootstrap needs to force-reload agents on
// the next call — useful in dev when an upstream service (e.g.
// pdf-service) changed and HMR didn't propagate into the agent
// closures. Not a runtime knob; edit in source + save to kick HMR.
const BOOTSTRAP_EPOCH = "2026-04-24T00:00:00Z";
void BOOTSTRAP_EPOCH;

/**
 * Idempotent agent bootstrap. First call creates every agent (which
 * attaches their subscribers to the bus singleton). Subsequent calls
 * return the same map — no new constructions, no duplicate handlers.
 */
export function initAgents(): Map<string, AIAgent> {
  if (_agents) return _agents;
  const bus = getAgentBus();
  const agents = new Map<string, AIAgent>();
  agents.set("job-matcher", new JobMatcherAIAgent(bus));
  agents.set("resume", new ResumeAIAgent(bus));
  agents.set("content", new ContentAIAgent(bus));
  agents.set("github", new GitHubAIAgent(bus));
  agents.set("linkedin", new LinkedInAIAgent(bus));
  agents.set("bureaucrat", new BureaucratAIAgent(bus));
  // Ghada (Visual Lead) — subscribes to `content:linkedin-post-created`
  // and produces a DALL-E diagram for new LinkedIn posts. No periodic
  // run path (event-driven).
  agents.set("ghada", new GhadaAIAgent(bus));
  _agents = agents;
  return agents;
}
