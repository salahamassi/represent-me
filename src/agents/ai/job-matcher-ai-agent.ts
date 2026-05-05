/**
 * AI Job Matcher Agent — Uses Claude to deeply analyze job-profile fit.
 * Publishes events for Resume Agent when high-fit jobs are found.
 */

import { AIAgent, type AIAgentConfig } from "../base/ai-agent";
import type { AgentBus } from "../base/agent-bus";
import { AIJobAnalysisSchema, type AIJobAnalysis } from "../schemas/job-analysis.schema";
import { SaqrLeadAnalysisSchema, type SaqrLeadAnalysis } from "../schemas/manual-lead.schema";
import { fetchRemoteOKJobs } from "@/services/remoteok-service";
import { fetchArcDevFlutterJobs, normalizeSearchedJob } from "@/services/job-search-service";
import { fetchLinkedInJobs } from "@/services/linkedin-jobs-service";
import {
  isJobSeen,
  markJobSeen,
  updateJobAIAnalysis,
  logRunStart,
  logRunEnd,
  markRunNotified,
  updateManualLead,
} from "@/lib/db";
import * as telegram from "@/lib/telegram";
import type { AgentResult, Finding, ActionItem } from "@/types";

/**
 * Round-robin merge across job sources, taking `chunkSize` jobs from each
 * source per pass. Keeps each source represented in the first N entries so
 * the downstream `slice(0, 10)` analysis budget doesn't starve later sources.
 */
function interleaveJobSources<T>(sources: T[][], chunkSize: number): T[] {
  const out: T[] = [];
  const cursors = sources.map(() => 0);
  let didAdvance = true;
  while (didAdvance) {
    didAdvance = false;
    for (let i = 0; i < sources.length; i++) {
      const start = cursors[i];
      const end = Math.min(start + chunkSize, sources[i].length);
      if (end > start) {
        out.push(...sources[i].slice(start, end));
        cursors[i] = end;
        didAdvance = true;
      }
    }
  }
  return out;
}

export class JobMatcherAIAgent extends AIAgent {
  constructor(bus: AgentBus) {
    const config: AIAgentConfig = {
      id: "job-matcher",
      name: "AI Job Matcher",
      systemPrompt: "",
      temperature: 0.2,
      maxTokens: 1500,
    };
    super(config, bus);

    // Build system prompt with profile context
    this.config.systemPrompt = `You are an expert career advisor and job matching specialist.

You are analyzing jobs for this candidate:
${this.getProfileContext()}

Your task: Analyze a job posting and determine how well this candidate fits.
Consider:
- Direct skill matches (exact technology match)
- Transferable skills (e.g., UIKit → SwiftUI, Flutter → React Native)
- Experience level and leadership potential
- Cultural and domain fit
- Salary market alignment
- RELOCATION BONUS: the candidate is open to relocating. If the posting mentions visa sponsorship, relocation assistance, or a clear willingness to support international hires, bump the fitPercentage by +5-10% and call this out in the reasoning. If it mandates a specific onsite location with no relocation support, nudge down slightly — the candidate can still commute globally for the right role but pure-remote is the default.

Be realistic but fair. This candidate has:
- Strong mobile expertise across iOS, Flutter, and React Native
- Proven AI/LLM integration experience: Claude AI integrated into production iOS app (WiNCH), AI-powered QA Agent (Trivia App), and a full 5-agent AI system (Represent Me) with event-driven architecture
- Skills in AI Agent Architecture, Prompt Engineering, Structured Output (Zod), and LLM Integration in Mobile Apps
- Leadership experience (VP of Innovation) and open source contributions (Flutter Bond framework)

IMPORTANT: When categorizing skills, check the candidate's FULL profile including experience highlights, technologies, and skills categories. If the candidate has built AI agents, integrated Claude API, or worked on AI-powered products, those count as "AI-powered products experience" and "AI agents building/integration experience" — mark them as matchedSkills with evidence, NOT missingSkills.`;

    // Listen for user approval to generate resume for moderate-fit jobs
    this.bus.subscribe("telegram:user-action", async (event) => {
      const action = event.payload as { type: string; id: string };
      if (action.type === "apply") {
        console.log(`[JobMatcher] User wants to apply for ${action.id}, requesting resume...`);
        await this.bus.publish("resume:generate", "job-matcher", {
          jobId: action.id,
          source: "user-approval",
        });
      }
    });

    // Phase 6 — Obeida Workflow: Saqr is the analyst on the manual-lead
    // chain. When Salah pastes a JD, we run a structured Claude pass to
    // lock exactly 3 Key Success Factors + a lean fit analysis, then
    // publish `manual-lead:analyzed` so Qalam and Amin can fan out.
    this.bus.subscribeOnce("job-matcher:manual-lead:submitted", "manual-lead:submitted", async (event) => {
      const payload = event.payload as {
        leadId: string;
        jdText: string;
        url: string | null;
        jobTitle: string;
        company: string;
        contactName: string | null;
      };
      console.log(`[Saqr] Manual lead received (${payload.leadId}) — analyzing JD...`);
      try {
        await this.analyzeManualLead(payload);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Saqr] Manual-lead analysis failed:", err);
        this.logStep(
          "manual-lead:error",
          `Manual-lead analysis failed: ${msg.slice(0, 120)}`,
          { leadId: payload.leadId, error: msg.slice(0, 500) }
        );
        updateManualLead(payload.leadId, { kitStatus: "error" });
      }
    });
  }

  /**
   * Saqr's manual-lead analyzer. Uses the broader `analyze()` path with
   * a JSON-shape schema that *requires* exactly 3 Key Success Factors —
   * Zod's `.length(3)` enforcement means we won't silently ship a 2 or
   * 4-item list. If Claude produces the wrong count, zod throws and the
   * outer catch flips the row to 'error'.
   */
  private async analyzeManualLead(payload: {
    leadId: string;
    jdText: string;
    url: string | null;
    jobTitle: string;
    company: string;
    contactName: string | null;
  }): Promise<void> {
    const { leadId, jdText, url, jobTitle, company, contactName } = payload;

    const prompt = `Analyze this job description for Salah. He got the lead via ${
      contactName ? `${contactName} (personal referral)` : "a direct paste"
    }.

JD:
"""
${jdText.slice(0, 4000)}
"""

User-provided metadata:
- Title: ${jobTitle === "Pending title" ? "(not provided — extract from JD)" : jobTitle}
- Company: ${company === "Pending company" ? "(not provided — extract from JD)" : company}
- URL: ${url || "(none)"}

Return JSON with this EXACT structure (all fields required):
{
  "jobTitle": "extracted or provided job title",
  "company": "extracted or provided company name",
  "summary": "one-paragraph summary of the role — what it IS, not a bullet list (20-400 chars)",
  "keySuccessFactors": [
    "Factor 1 — actionable, specific",
    "Factor 2 — actionable, specific",
    "Factor 3 — actionable, specific"
  ],
  "matchedSkills": [{"skill": "Swift", "evidence": "5+ years iOS at WiNCH"}],
  "transferableSkills": [{"required": "Kotlin", "transferFrom": "Swift", "confidence": "medium"}],
  "missingSkills": ["Docker"],
  "fitPercentage": 88,
  "resumeEmphasis": ["UIKit→SwiftUI migration", "Crash-rate reduction"],
  "applicationTips": "One sentence of tactical advice."
}

CRITICAL:
- keySuccessFactors MUST be an array of EXACTLY 3 strings — not 2, not 4.
- Factors are actionable, not generic ("Lead a 0→1 SwiftUI rewrite with tight release cadence", NOT "Be a team player").
- confidence is one of "high" | "medium" | "low".
- Be realistic on fitPercentage — only count skills Salah actually has.`;

    const result = await this.analyze(prompt, SaqrLeadAnalysisSchema, {
      maxTokens: 2000,
    });
    const analysis = result.data;

    // Persist Saqr's output onto the lead row so downstream agents and
    // the UI can read it without another Claude call.
    updateManualLead(leadId, {
      keySuccessFactors: JSON.stringify(analysis.keySuccessFactors),
      fitPercentage: analysis.fitPercentage,
      aiAnalysis: JSON.stringify(analysis),
      kitStatus: "analyzed",
    });

    // Human-readable activity row — surfaces in the Chatter Feed as the
    // "Saqr locked 3 factors" message.
    this.logStep(
      "manual-lead:analyzed",
      `${analysis.fitPercentage}% fit — ${analysis.company}. Factors: ${analysis.keySuccessFactors.join(" · ")}`,
      {
        leadId,
        factors: analysis.keySuccessFactors,
        fitPercentage: analysis.fitPercentage,
        company: analysis.company,
      }
    );

    // Fan out — Qalam and Amin subscribe to this event independently.
    await this.bus.publish("manual-lead:analyzed", "job-matcher", {
      leadId,
      jdText,
      url,
      jobTitle: analysis.jobTitle,
      company: analysis.company,
      contactName,
      fitPercentage: analysis.fitPercentage,
      analysis,
    });
  }

  async run(context?: Record<string, unknown>): Promise<AgentResult> {
    this.currentRunId = context?.runId as number | undefined;
    const findings: Finding[] = [];
    const actionItems: ActionItem[] = [];
    const runId = logRunStart("job-matcher");

    try {
      // Fetch from multiple sources
      this.logStep("fetch", "Fetching jobs from RemoteOK + Arc.dev + LinkedIn");

      const [remoteOKResult, arcDevResult, linkedInResult] = await Promise.allSettled([
        fetchRemoteOKJobs(),
        fetchArcDevFlutterJobs(),
        fetchLinkedInJobs(),
      ]);

      const remoteOKJobs = remoteOKResult.status === "fulfilled" ? remoteOKResult.value.jobs : [];
      const arcDevRaw = arcDevResult.status === "fulfilled" ? arcDevResult.value : [];
      const arcDevJobs = arcDevRaw.map(normalizeSearchedJob);
      const linkedInRaw = linkedInResult.status === "fulfilled" ? linkedInResult.value : [];
      const linkedInJobs = linkedInRaw.map(normalizeSearchedJob);

      // Interleave sources in chunks of 2 so the slice(0, 10) analysis
      // budget below is shared fairly. A flat concat would always starve
      // the last source(s) when the earlier ones return >= 10 jobs.
      const jobs = interleaveJobSources([remoteOKJobs, arcDevJobs, linkedInJobs], 2);
      this.logStep(
        "fetch",
        `${jobs.length} jobs found (RemoteOK: ${remoteOKJobs.length}, Arc.dev: ${arcDevJobs.length}, LinkedIn: ${linkedInJobs.length})`,
        { total: jobs.length }
      );

      const newJobs = jobs.filter((j) => !isJobSeen(j.id));
      this.logStep("fetch", `${newJobs.length} new jobs to analyze`, { newCount: newJobs.length });

      if (newJobs.length === 0) {
        logRunEnd(runId, "success", 0, 0);
        return { findings, actionItems };
      }

      // Analyze up to 10 jobs with Claude (batch with concurrency limit)
      const toAnalyze = newJobs.slice(0, 10);
      const results: { job: typeof toAnalyze[0]; analysis: AIJobAnalysis }[] = [];

      // Process 3 at a time
      for (let i = 0; i < toAnalyze.length; i += 3) {
        const batch = toAnalyze.slice(i, i + 3);
        const batchResults = await Promise.all(
          batch.map(async (job) => {
            try {
              const analysis = await this.analyzeJob(job, runId);
              return { job, analysis };
            } catch (err) {
              console.error(`[AI JobMatcher] Failed to analyze ${job.title}:`, err);
              return null;
            }
          })
        );
        results.push(...batchResults.filter(Boolean) as typeof results);
      }

      // Process results by fit tier
      for (const { job, analysis } of results) {
        // Use the job's own URL if available, otherwise construct from RemoteOK
        const jobUrl = (job as any).url || `https://remoteok.com/remote-jobs/${job.id.replace("remoteok-", "")}`;

        const source = job.id.split("-")[0] || "remoteok";

        // Skip jobs below 30% — they're noise
        if (analysis.fitPercentage < 30) {
          console.log(`[AI JobMatcher] SKIP ${analysis.fitPercentage}%: ${job.title} — too low`);
          // Mark as seen so we don't re-analyze, but don't save details
          markJobSeen({
            id: job.id, source, title: job.title, company: job.company,
            url: jobUrl, fitPercentage: analysis.fitPercentage,
          });
          continue;
        }

        // Save to DB
        markJobSeen({
          id: job.id,
          source,
          title: job.title,
          company: job.company,
          url: jobUrl,
          fitPercentage: analysis.fitPercentage,
          matchedSkills: analysis.matchedSkills.map((s) => s.skill),
          missingSkills: analysis.missingSkills,
        });

        updateJobAIAnalysis(
          job.id,
          JSON.stringify(analysis),
          analysis.salaryEstimate
            ? `${analysis.salaryEstimate.currency} ${analysis.salaryEstimate.min}-${analysis.salaryEstimate.max}`
            : undefined
        );

        if (analysis.fitPercentage >= 85) {
          // HIGH FIT — auto-generate resume
          findings.push({
            id: `job-high-${job.id}`,
            agentId: "job-matcher",
            severity: "positive",
            title: `${analysis.fitPercentage}% fit: ${job.title} at ${job.company}`,
            description: analysis.reasoning,
            category: "high-fit",
            evidence: jobUrl,
          });

          console.log(`[AI JobMatcher] HIGH FIT ${analysis.fitPercentage}%: ${job.title} — triggering resume`);

          await this.bus.publish("job:high-fit", "job-matcher", {
            jobId: job.id,
            jobTitle: job.title,
            company: job.company,
            url: jobUrl,
            fitPercentage: analysis.fitPercentage,
            analysis,
          });

        } else if (analysis.fitPercentage >= 60) {
          // MODERATE FIT — notify user
          findings.push({
            id: `job-mod-${job.id}`,
            agentId: "job-matcher",
            severity: "info",
            title: `${analysis.fitPercentage}% fit: ${job.title} at ${job.company}`,
            description: analysis.reasoning,
            category: "moderate-fit",
            evidence: jobUrl,
          });

          console.log(`[AI JobMatcher] MODERATE FIT ${analysis.fitPercentage}%: ${job.title} — notifying`);

          await this.sendModerateJobAlert(job, analysis, jobUrl);

        } else {
          // LOW FIT — log silently
          findings.push({
            id: `job-low-${job.id}`,
            agentId: "job-matcher",
            severity: "info",
            title: `${analysis.fitPercentage}% fit: ${job.title} at ${job.company}`,
            description: "Below threshold, logged for reference",
            category: "low-fit",
          });
        }
      }

      // Action items from aggregated missing skills
      const allMissing: Record<string, number> = {};
      results.forEach(({ analysis }) => {
        if (analysis.fitPercentage >= 60) {
          analysis.missingSkills.forEach((s) => {
            allMissing[s] = (allMissing[s] || 0) + 1;
          });
        }
      });

      Object.entries(allMissing)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .forEach(([skill, count]) => {
          actionItems.push({
            id: `learn-${skill.toLowerCase().replace(/\s/g, "-")}`,
            agentId: "job-matcher",
            priority: count >= 3 ? "high" : "medium",
            effort: "significant",
            title: `Learn ${skill}`,
            description: `Missing in ${count} matching jobs. Adding this skill would improve your fit.`,
            completed: false,
          });
        });

      if (results.length > 0) {
        markRunNotified(runId);
      }
      logRunEnd(runId, "success", findings.length, actionItems.length);

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logRunEnd(runId, "error", 0, 0, msg);
      console.error("[AI JobMatcher] Error:", msg);
    }

    return { findings, actionItems };
  }

  private async analyzeJob(
    job: { id: string; title: string; company: string; description: string; requiredSkills: string[] },
    runId?: number
  ): Promise<AIJobAnalysis> {
    const prompt = `Analyze this job posting for the candidate:

Job Title: ${job.title}
Company: ${job.company}
Description: ${job.description}
Listed Skills: ${job.requiredSkills.join(", ")}

Return a JSON object with this EXACT structure (use these exact camelCase key names):
{
  "fitPercentage": 75,
  "reasoning": "Why this job fits or doesn't fit",
  "matchedSkills": [{"skill": "Flutter", "evidence": "5+ years experience"}],
  "transferableSkills": [{"required": "React Native", "transferFrom": "Flutter", "confidence": "high"}],
  "missingSkills": ["Skill not in profile"],
  "salaryEstimate": {"min": 4000, "max": 6000, "currency": "USD", "confidence": "medium"},
  "resumeEmphasis": ["Flutter Bond framework", "VP Innovation experience"],
  "applicationTips": "One string with application advice"
}

CRITICAL RULES:
- transferableSkills: array of OBJECTS with "required", "transferFrom", "confidence" (high/medium/low)
- salaryEstimate: an OBJECT (not a string), or omit entirely if unknown
- applicationTips: a single STRING (not an array)
- matchedSkills: array of OBJECTS with "skill" and "evidence"
- ALL fields required except salaryEstimate which is optional`;

    const result = await this.analyze(prompt, AIJobAnalysisSchema, { runId });
    return result.data;
  }

  private async sendModerateJobAlert(
    job: { id: string; title: string; company: string },
    analysis: AIJobAnalysis,
    url: string
  ) {
    const matched = analysis.matchedSkills.slice(0, 4).map((s) => s.skill).join(", ");
    const transferable = analysis.transferableSkills.slice(0, 2).map((s) => `${s.transferFrom}→${s.required}`).join(", ");
    const missing = analysis.missingSkills.slice(0, 3).join(", ");

    const text = [
      `<b>🎯 ${analysis.fitPercentage}% Match: ${job.title}</b>`,
      `Company: ${job.company}`,
      ``,
      `<b>Why it fits:</b> ${analysis.reasoning.slice(0, 200)}`,
      ``,
      `Matched: ${matched}`,
      transferable ? `Transferable: ${transferable}` : "",
      missing ? `Missing: ${missing}` : "",
      analysis.salaryEstimate
        ? `Salary: ${analysis.salaryEstimate.currency} ${analysis.salaryEstimate.min.toLocaleString()}-${analysis.salaryEstimate.max.toLocaleString()}`
        : "",
      ``,
      `Tip: ${analysis.applicationTips.slice(0, 150)}`,
      ``,
      `<a href="${url}">View Job</a>`,
    ].filter(Boolean).join("\n");

    const keyboard = [
      [
        { text: "Generate Resume & Apply", callback_data: `apply:${job.id}` },
        { text: "Dismiss", callback_data: `dismiss:${job.id}` },
      ],
    ];

    await telegram.sendMessage(text, keyboard);
  }
}
