/**
 * BureaucratAIAgent — the "Compliance & Admin" operator in the War Room.
 *
 * Responsibilities (Phase 3 scope):
 *   1. Subscribe to `job:high-fit` events on the bus.
 *   2. Compute a 0–10 ATS score from the upstream Claude analysis the
 *      Job Matcher already produced (matched / transferable / missing
 *      skills). Heuristic on purpose — no second Claude call needed,
 *      no extra cost, and deterministic so the chain is reproducible.
 *   3. Publish `bureaucrat:ats-check-complete` with the score + top
 *      missing keywords so downstream listeners (and the War Room UI
 *      via activity_log) can react.
 *
 * Future scope (not wired yet): visa-deadline alerts, application-
 * close-date alerts, and actual PDF-based ATS scanning via the
 * existing /api/jobs/ats-scan pipeline. The event-type namespace
 * (`bureaucrat:*`) is reserved for these.
 *
 * v3 — Explicitly OUT of scope: exam-prep / IELTS / mock-test
 * tracking. The system is dedicated to engineering career growth,
 * not language certification. Do not re-add exam features here.
 */

import { AIAgent, type AIAgentConfig } from "../base/ai-agent";
import type { AgentBus } from "../base/agent-bus";
import type { AgentResult } from "@/types";
import type { AIJobAnalysis } from "../schemas/job-analysis.schema";
import { isLeadApproved, getLeadApprovalStatus } from "@/lib/db";

/** Shape of the `job:high-fit` event payload, mirrors job-matcher-ai-agent. */
interface JobHighFitPayload {
  jobId: string;
  jobTitle: string;
  company: string;
  url: string;
  fitPercentage: number;
  analysis: AIJobAnalysis;
}

/** What the Bureaucrat broadcasts when it finishes an ATS check. */
export interface BureaucratATSCheckPayload {
  jobId: string;
  jobTitle: string;
  company: string;
  /** 0.0 – 10.0, one decimal of precision. */
  score: number;
  /** Top keywords from `missingSkills` that the CV doesn't cover. */
  missingKeywords: string[];
  /** Copy-ready human summary for the UI. */
  summary: string;
  /** Either "pass" (≥7.5), "borderline" (5.0–7.4) or "fail" (<5.0). */
  verdict: "pass" | "borderline" | "fail";
}

/**
 * Compute the ATS score from the Job Matcher's already-computed skill
 * tallies. Transferable skills count as half — they'll be read as
 * matches by most scanners but we don't want to overweight them since
 * the hiring manager might still flag a gap.
 *
 *   score = ( matched + transferable * 0.5 ) / total * 10
 *
 * If the analysis has no skills at all (edge case), default to 7.0
 * — a neutral "worth a look" score rather than a misleading zero.
 */
function computeATSScore(analysis: AIJobAnalysis): {
  score: number;
  total: number;
} {
  const matched = analysis.matchedSkills?.length ?? 0;
  const transferable = analysis.transferableSkills?.length ?? 0;
  const missing = analysis.missingSkills?.length ?? 0;
  const total = matched + transferable + missing;
  if (total === 0) return { score: 7.0, total: 0 };
  const raw = ((matched + transferable * 0.5) / total) * 10;
  return { score: Math.round(raw * 10) / 10, total };
}

function verdictFor(score: number): BureaucratATSCheckPayload["verdict"] {
  if (score >= 7.5) return "pass";
  if (score >= 5.0) return "borderline";
  return "fail";
}

export class BureaucratAIAgent extends AIAgent {
  constructor(bus: AgentBus) {
    const config: AIAgentConfig = {
      id: "bureaucrat",
      name: "Bureaucrat",
      systemPrompt:
        "Compliance & admin operator. Runs ATS score checks and surfaces keyword gaps.",
      temperature: 0.0, // deterministic — we're not invoking Claude here
      maxTokens: 1,     // defensive: this agent shouldn't be making Claude calls
    };
    super(config, bus);

    // Every high-fit job triggers a compliance check automatically.
    // The Resume Agent's own `job:high-fit` subscription runs in parallel
    // — the two agents are independent branches of the same A2A fan-out.
    this.bus.subscribe("job:high-fit", async (event) => {
      const payload = event.payload as JobHighFitPayload;
      // Approval gate — Kareem (Bureaucrat) doesn't run an ATS check
      // until Salah explicitly approves the mission. Otherwise every
      // scouted high-fit hit would burn Claude tokens on compliance
      // work the user might not actually want done yet.
      const status = getLeadApprovalStatus(payload.jobId);
      if (!isLeadApproved(status)) {
        console.log(
          `[Bureaucrat] Job ${payload.jobId} pending approval — standby.`
        );
        this.logStep(
          "kareem:standby",
          `On standby for ${payload.company} · awaiting approval`,
          { jobId: payload.jobId, approvalStatus: status }
        );
        return;
      }
      console.log(
        `[Bureaucrat] High-fit approved for ${payload.company} — running ATS check...`
      );
      try {
        await this.runATSCheck(payload);
      } catch (err) {
        console.error("[Bureaucrat] ATS check failed:", err);
      }
    });
  }

  /**
   * Manually triggering the Bureaucrat (via Run All Agents) is a no-op
   * today — everything meaningful happens inside its bus subscriptions.
   * We still return a status finding so the UI shows the agent as alive.
   */
  async run(): Promise<AgentResult> {
    return {
      findings: [
        {
          id: "bureaucrat-standby",
          agentId: "bureaucrat",
          severity: "info",
          title: "Bureaucrat is on standby",
          description:
            "Listening for job:high-fit events to run ATS compliance checks.",
          category: "status",
        },
      ],
      actionItems: [],
    };
  }

  /**
   * The heart of the agent. Computes the ATS score, picks up to three
   * missing keywords for the UI, publishes the chain event, and logs a
   * human-readable activity row so the Chatter Feed reads like a real
   * teammate reporting in.
   */
  private async runATSCheck(payload: JobHighFitPayload): Promise<void> {
    const { analysis, jobId, jobTitle, company } = payload;
    const { score, total } = computeATSScore(analysis);
    const missingKeywords = (analysis.missingSkills || []).slice(0, 3);
    const verdict = verdictFor(score);

    const summary = this.buildSummary(score, verdict, missingKeywords);

    // Human-readable row for the War Room chatter feed. Goes through
    // logActivity (not via bus) so the title stays clean — the bus
    // event itself is announced separately below with the full payload.
    this.logStep(
      "bureaucrat:ats-check",
      `ATS ${score.toFixed(1)}/10 — ${company}${missingKeywords.length > 0 ? ` (gaps: ${missingKeywords.join(", ")})` : " (clean)"}`,
      { jobId, score, total, verdict, missingKeywords }
    );

    // Chain event the UI / other agents can listen for.
    const out: BureaucratATSCheckPayload = {
      jobId,
      jobTitle,
      company,
      score,
      missingKeywords,
      summary,
      verdict,
    };
    await this.bus.publish("bureaucrat:ats-check-complete", "bureaucrat", out);
  }

  private buildSummary(
    score: number,
    verdict: BureaucratATSCheckPayload["verdict"],
    missing: string[]
  ): string {
    const scoreStr = score.toFixed(1);
    if (verdict === "pass" && missing.length === 0)
      return `ATS Score: ${scoreStr}/10 — clean pass, no gaps.`;
    if (missing.length === 0)
      return `ATS Score: ${scoreStr}/10 — ${verdict}, no specific gaps flagged.`;
    return `ATS Score: ${scoreStr}/10 — ${verdict} (missing: ${missing.join(", ")}).`;
  }
}
