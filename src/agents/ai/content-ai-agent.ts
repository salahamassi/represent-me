/**
 * AI Content Agent — Multi-mode agent:
 * - "weekly": Generate LinkedIn posts and article ideas (original)
 * - "code-gems": Mine gems from user's repos, generate content
 * Also responds to contribution lifecycle events (PR opened/merged).
 */

import { z } from "zod/v4";
import { AIAgent, type AIAgentConfig } from "../base/ai-agent";
import type { AgentBus } from "../base/agent-bus";
import { ContentGenerationSchema } from "../schemas/content.schema";
import { QalamLeadBriefSchema, type SaqrLeadAnalysis } from "../schemas/manual-lead.schema";
import {
  updateManualLead,
  isLeadApproved,
  getLeadApprovalStatus,
  saveLeadContent,
  advanceToKitReadyIfBothDone,
  recordMissionError,
  clearMissionError,
} from "@/lib/db";

/** Bus payload shape emitted by Saqr after manual-lead analysis. */
interface ManualLeadAnalyzedPayload {
  leadId: string;
  jdText: string;
  url: string | null;
  jobTitle: string;
  company: string;
  contactName: string | null;
  fitPercentage: number;
  analysis: SaqrLeadAnalysis;
}

/**
 * Tight schema for the stack-specific LinkedIn draft fired from
 * `job:high-fit` events. Inlined instead of living in
 * schemas/content.schema.ts because it's only used by this one
 * subscriber and the shape is trivial.
 */
const SocialDraftSchema = z.object({
  post: z
    .string()
    .min(1)
    .max(1500)
    .describe("3-sentence first-person LinkedIn post."),
  hashtags: z
    .array(z.string())
    .describe("Tech-stack hashtags to append at the bottom (we cap to 5 after parsing)."),
});
import { ContributionContentSchema, type ContributionContent } from "../schemas/contribution-content.schema";
import type { CodeGemsAnalysis } from "../schemas/code-gems.schema";
import { ContentScoreSchema, type ContentScore as ContentScoreRaw } from "../schemas/content-score.schema";
import { mediumArticles } from "@/data/medium-data";
import { profile } from "@/data/profile";
import type { ChatMessage, ContentSourceContext } from "@/types";
import {
  insertGeneratedContent,
  insertCodeGem,
  updateCodeGemContent,
  markContributionContentGenerated,
  getContributionById,
  setContentImage,
} from "@/lib/db";
import { promises as fsp } from "node:fs";
import nodePath from "node:path";
import { renderInfographic } from "@/services/infographic-renderer";
import { autoGenerateCarousel } from "@/services/auto-carousel";
import * as telegram from "@/lib/telegram";

// Match the manual /api/content/mine route's PNG output location so the
// review UI and Zernio publisher both find gem visuals at the same path.
const INFOGRAPHIC_DIR = nodePath.join(process.cwd(), "public", "infographics");
import type { AgentResult, Finding, ActionItem, OSSContribution } from "@/types";

// User's notable repos for code gems mining (gold mine repos)
// Each repo includes business context so the AI understands the "why" behind the code
/**
 * Repos (and monorepo sub-packages) Layla mines for code gems. The
 * `path` field is optional — when present, the GitHub agent's
 * `analyzeRepoForGems` filters its tree-walk to that subdirectory so
 * Layla focuses on a single Bond package instead of the whole
 * monorepo (which would dilute the gem signal).
 */
interface MiningTarget {
  owner: string;
  repo: string;
  branch: string;
  context: string;
  /** Optional monorepo subpath. Files outside this prefix are skipped
   *  by the GitHub agent. Use trailing slash convention is fine but
   *  not required — we normalise on the consuming side. */
  path?: string;
}

const NOTABLE_REPOS: MiningTarget[] = [
  {
    owner: "devmatrash",
    repo: "trivia",
    branch: "develop",
    context: `Multiplayer trivia game app built with Flutter using Bond framework.
Real-time gameplay with WebSocket connections, leaderboards, in-app purchases,
push notifications, and secure storage. The app handles complex initialization
sequences (Firebase, messaging, splash screens) and environment-specific configs
(dev/staging/prod). Device-aware pagination (phone vs tablet). Production app.`,
  },
  {
    owner: "winchsa",
    repo: "ios-app",
    branch: "master",
    context: `WinchKSA — a roadside-assistance dispatch iOS app (drivers and fleet
owners request a tow truck / winch when their vehicle breaks down) serving 4 user types:
customers, business accounts, tow-truck providers, and fleet owners.
Multi-tenant API where every endpoint changes based on user type. Real-time order tracking
with state machines (new → accepted → arrived → in_progress → completed), payment processing,
provider verification flow, offer system. Production app with real users in Saudi Arabia.
50+ image assets, protocol-oriented architecture, AppRouter navigation system.`,
  },
  // ─── Bond Factory ──────────────────────────────────────────────────
  // The Bond ecosystem moved from `onestudio-co/` to `flutterbond/`
  // and is structured as a Melos monorepo at `flutterbond/bond-core`,
  // with each module living under `packages/`. Each entry below points
  // at the same repo but targets a different package via `path`, so
  // Layla mines them as INFRASTRUCTURE-level technical case studies
  // rather than "any random file in a 7-package monorepo".
  {
    owner: "flutterbond",
    repo: "bond-core",
    branch: "main",
    path: "packages/form",
    context: `Bond Form — the reactive form-validation package of the Bond
Flutter framework. Provides field-level validation rules with reactive state,
separating validation logic from the widget tree. Goldmine for posts about:
validation state machines, async validators, error surfacing patterns,
form-to-API serialization, how reactive validation composes across multi-step
flows, and the architectural choice to decouple FormState from UI. Used across
10+ production client apps.`,
  },
  {
    owner: "flutterbond",
    repo: "bond-core",
    branch: "main",
    path: "packages/network",
    context: `Bond Network — the HTTP / networking package of the Bond Flutter
framework. Handles API client construction, request/response interceptors,
retry logic, error mapping, and caching — all wired into Bond's service
container so apps can swap implementations without rewriting business logic.
Goldmine for posts about: provider-agnostic networking, type-safe response
decoding, interceptor pipelines, how reactive caching ties into network
responses, and separating transport from domain. Used across 10+ production
client apps.`,
  },
  {
    owner: "flutterbond",
    repo: "bond-core",
    branch: "main",
    path: "packages/app_analytics",
    context: `Bond Analytics — Multi-provider analytics (Firebase, Mixpanel,
Amplitude) where each provider maps to its platform's STANDARD predefined
events (not custom strings) so marketers can run retargeting campaigns and
attribution tracking. UnimplementedError pattern routes events to the right
provider handler — if a specific provider hasn't implemented logSignedUp(),
it falls back to a generic logEvent() call. THIS is the source of the
AnalyticsProvider golden-standard post — gems found here should reinforce
that voice. Used across 10+ production client apps.`,
  },
  {
    owner: "flutterbond",
    repo: "bond-core",
    branch: "main",
    // No path — fallback for whole-repo mining (e.g., cache, core,
    // notifications, socialite packages all live here). Less focused
    // than the per-package entries above, kept for breadth.
    context: `Bond — a Laravel-inspired Flutter framework built by Salah's
team. Melos monorepo at flutterbond/bond-core with packages: app_analytics,
cache (SharedPreferences/SecureStorage/InMemory drivers, reactive streams,
TTL), core (service container / IoC), form, network, notifications,
socialite. Used across 10+ production client apps. The per-package
NOTABLE_REPOS entries above narrow to the highest-signal modules; this
entry exists so the cron can still surface gems from the smaller modules
when chosen.`,
  },
];

/**
 * Resolve the business-context blurb for a repo (e.g. "devmatrash/trivia").
 * Returns "" if the repo isn't in NOTABLE_REPOS so the prompt can degrade
 * gracefully — Claude will still have the gem itself to work from.
 */
export function findRepoContext(repoName: string): string {
  const match = NOTABLE_REPOS.find((r) => `${r.owner}/${r.repo}` === repoName);
  return match?.context || "";
}

/**
 * The shape of a single gem as stored inside code_gems.ai_analysis (JSON).
 * Mirrors CodeGemsAnalysisSchema["gems"][number] but kept narrow so the
 * regenerate path doesn't have to import zod just for the type.
 */
export interface GemForRegeneration {
  repoName: string;
  filePath: string;
  gemType: string;
  title: string;
  description: string;
  codeSnippet: string;
  usageExample: string;
  realProblem: string;
  whyInteresting: string;
  contentAngle: string;
  suggestedPlatform: "linkedin" | "medium" | "devto";
  suggestedTitle: string;
}

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
- LinkedIn posts: 200-300 words, hook first line, end with question/CTA. Always add 3-5 relevant hashtags at the end (e.g. #Flutter #iOS #MobileDev #CleanCode)
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

    // Phase 3 collaboration chain: when the Job Matcher flags a high-fit
    // job, the Ghostwriter drafts a stack-specific LinkedIn post so the
    // user can fire a fresh piece of content alongside the application.
    // Runs independently of the Resume Agent's parallel branch — no
    // coordination needed, bus fan-out handles it.
    this.bus.subscribe("job:high-fit", async (event) => {
      const data = event.payload as {
        jobId: string;
        jobTitle: string;
        company: string;
        url: string;
        fitPercentage: number;
        analysis?: {
          matchedSkills?: Array<{ skill: string; evidence?: string }>;
          missingSkills?: string[];
        };
      };
      console.log(
        `[Ghostwriter] High-fit at ${data.company} — drafting stack-specific social post...`
      );
      this.logStep("ghostwriter:subscribe-fired", `Ghostwriter got high-fit for ${data.company}`, {
        jobId: data.jobId,
        company: data.company,
      });
      try {
        await this.draftSocialForHighFit(data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Ghostwriter] Social draft failed:", err);
        this.logStep("ghostwriter:error", `Social draft failed: ${msg.slice(0, 120)}`, {
          jobId: data.jobId,
          error: msg.slice(0, 500),
        });
      }
    });

    // Phase 6 — Obeida Workflow: Qalam's consultation brief + recommendation
    // draft. Fires after Saqr finishes analyzing the manual lead.
    this.bus.subscribeOnce("content:manual-lead:analyzed", "manual-lead:analyzed", async (event) => {
      const data = event.payload as ManualLeadAnalyzedPayload;
      // Approval gate — Layla stays in standby until Salah approves
      // the mission via the Command Bar. No drafts get written
      // speculatively; the user always opts in first.
      const status = getLeadApprovalStatus(data.leadId);
      if (!isLeadApproved(status)) {
        console.log(
          `[Layla/Qalam] Manual lead ${data.leadId} pending approval — standby.`
        );
        this.logStep(
          "qalam:standby",
          `On standby for ${data.company} · awaiting approval`,
          { leadId: data.leadId, approvalStatus: status }
        );
        return;
      }
      console.log(`[Qalam] Manual lead analyzed for ${data.company} — drafting brief…`);
      try {
        await this.draftManualLeadBrief(data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Qalam] Manual-lead brief failed:", err);
        this.logStep("qalam:manual-lead-error", `Brief failed: ${msg.slice(0, 120)}`, {
          leadId: data.leadId,
          error: msg.slice(0, 500),
        });
      }
    });

    // v3 Plan A Phase 3 — Mission start subscriber. The War Room's
    // unified Trigger / Approve flow publishes `mission:started`
    // immediately after `seen_jobs.mission_status` flips to
    // IN_PROGRESS. Layla owns the cover-letter draft for that lead;
    // the row lands in `generated_content` with `related_lead_id` so
    // the workbench panel can replace the synthetic typing animation
    // with the real char count. Different content_type from the
    // social-post draft fired by `job:high-fit`, so both can coexist.
    this.bus.subscribe("mission:started", async (event) => {
      const data = event.payload as {
        leadId: string;
        company: string;
        jobTitle: string;
        url: string | null;
        fitPercentage: number | null;
        analysis: unknown;
        startedAt: string;
      };
      console.log(
        `[Layla] mission:started — drafting cover letter for ${data.company}`
      );
      this.logStep(
        "layla:mission-start",
        `Drafting cover letter · ${data.company}`,
        { leadId: data.leadId, company: data.company }
      );
      // v3 Plan A Phase F — clear any stale error from a prior failed
      // attempt before we run. If THIS attempt fails we'll re-record
      // below; if it succeeds the cleared row is the truth.
      clearMissionError(data.leadId);
      try {
        await this.draftCoverLetterForLead(data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Layla] Cover letter draft failed:", err);
        this.logStep(
          "layla:cover-letter-error",
          `Cover letter failed: ${msg.slice(0, 120)}`,
          { leadId: data.leadId, error: msg.slice(0, 500) }
        );
        // v3 Plan A Phase F — Surface the failure on the LeadDetail
        // panel so Salah can see "Layla: <error>" + a Retry button.
        recordMissionError(data.leadId, "layla", msg);
      }
    });
  }

  /**
   * Qalam's warm, proactive message when a manual lead lands. Writes:
   *   1. A short chat brief — first-person, names the referrer, ends
   *      with a soft "want me to draft the recommendation?" question.
   *   2. A ready-to-send recommendation-request draft Salah can copy.
   *
   * When the referrer is tagged as a former student (Obeida), we pass
   * that history into the prompt so the drafts lean into the teacher→
   * mentor dynamic.
   */
  private async draftManualLeadBrief(data: ManualLeadAnalyzedPayload): Promise<void> {
    const { leadId, company, jobTitle, contactName, analysis } = data;
    const isObeida = !!contactName && contactName.toLowerCase().includes("obeida");

    const prompt = `Salah just got a manual lead for a role at ${company} (${jobTitle}).
${contactName ? `Referrer: ${contactName}.` : "No referrer named."}
${
  isObeida
    ? "Important context: Obeida was Salah's student 5 years ago. He's now reaching out with this lead. Your drafts should lean into that teacher→mentor history — warm, genuinely proud of him, specific to what Salah taught or modelled."
    : ""
}

Saqr's summary: ${analysis.summary}

Key Success Factors:
${analysis.keySuccessFactors.map((f, i) => `${i + 1}. ${f}`).join("\n")}

Task: Return JSON with two strings.

1) "chatBrief" — a SHORT first-person message from you (Qalam) to Salah.
   Structure:
   - First line: "Salah, ${contactName ? contactName + "'s" : "this"} lead looks solid."
   - 2–3 sentences that capture the VIBE of this role (not a bullet list
     — tell him what it feels like, what the reader-of-his-CV will want
     to hear, what his angle should be).
   - End with a soft question: "Want me to draft a recommendation request for ${contactName || "him"}?" or similar.

2) "recommendationRequestDraft" — A PLAIN TEXT draft Salah can send to
   ${contactName || "the referrer"} asking for a recommendation / intro.
   ${
     isObeida
       ? "Since Obeida is his former student: open warmly, reference their history (without naming specific modules/classes — keep it authentic), make the ask clean, no preamble. ~8–12 lines."
       : "Short, warm, direct. Reference the shared context if any. ~8–12 lines."
   }

Voice: warm, confident, writerly. No "looking for work" language.`;

    const result = await this.analyze(prompt, QalamLeadBriefSchema, {
      model: "claude-haiku-4-5-20251001",
      systemOverride:
        "You are Qalam (قلم) — the Creative Lead on Salah's team. You write in his voice: warm, confident, specific. Output valid JSON matching the schema. No preamble.",
      temperature: 0.7,
      maxTokens: 900,
      runId: this.currentRunId,
    });

    const { chatBrief, recommendationRequestDraft } = result.data;

    // Persist so the UI / Amin can read without re-calling Claude.
    updateManualLead(leadId, {
      qalamBrief: chatBrief,
      recommendationDraft: recommendationRequestDraft,
    });

    // Surface the brief in the Chatter Feed as Qalam's voice.
    this.logStep(
      "qalam:manual-lead-brief",
      chatBrief.slice(0, 180),
      {
        leadId,
        company,
        jobTitle,
        contactName: contactName || null,
        draftPreview: recommendationRequestDraft.slice(0, 160),
      }
    );

    // Notify the rest of the system — useful if someone later wants to
    // auto-open Qalam's chat drawer with this brief pre-loaded.
    await this.bus.publish("manual-lead:qalam-brief-ready", "content", {
      leadId,
      company,
      jobTitle,
      contactName,
      chatBrief,
      recommendationRequestDraft,
    });
  }

  /**
   * Draft a short LinkedIn-style post spotlighting Salah's expertise in
   * the matched technologies of a high-fit job. Uses Haiku for speed and
   * cost — we're not crafting an essay, just a 3-sentence humble-brag
   * the user can review and post.
   *
   * Publishes `ghostwriter:social-draft-ready` so the War Room UI can
   * flip the "LinkedIn Draft Ready" chip on the Jarvis Brief.
   */
  /**
   * v3 Plan A Phase 3 — Generates a tailored cover letter for a
   * specific lead and writes a `generated_content` row tagged with
   * `related_lead_id`. The Layla workbench panel queries this table
   * to display real progress (char count from the actual draft)
   * instead of the prior timer-driven synthetic row.
   *
   * Voice constraints come from the same persona prompt the chat
   * drawer uses for Layla (warm, no "seeking new challenges" energy,
   * lead with story not CV dump). We keep the call cheap — Sonnet
   * with a tight max_tokens budget — because this fires automatically
   * on every Approve / Trigger click and we don't want runaway costs.
   *
   * Bus events emitted:
   *   - `content:cover-letter-start` (when the draft begins)
   *   - `content:cover-letter-ready` (with contentId on success)
   *   - `content:cover-letter-error` (on failure, with the message)
   * Each event surfaces in the Radio Chatter via SSE and in Layla's
   * recent-logs strip via the activity_log.
   */
  private async draftCoverLetterForLead(payload: {
    leadId: string;
    company: string;
    jobTitle: string;
    url: string | null;
    fitPercentage: number | null;
    analysis: unknown;
  }): Promise<void> {
    const { leadId, company, jobTitle, fitPercentage } = payload;

    // Pull whatever skill/gap structure the lead already has from
    // its Saqr / job-matcher analysis. Cover letters that name
    // specific evidence land harder than generic ones.
    const analysis = payload.analysis as
      | {
          matchedSkills?: Array<{ skill: string; evidence?: string }>;
          missingSkills?: string[];
          reasoning?: string;
          summary?: string;
        }
      | null;

    const matched = (analysis?.matchedSkills || [])
      .slice(0, 4)
      .map((s) => `- ${s.skill}${s.evidence ? ` (${s.evidence})` : ""}`)
      .join("\n");
    const missing = (analysis?.missingSkills || []).slice(0, 3).join(", ");
    const roleSummary = analysis?.summary?.trim() || "";

    this.logStep(
      "content:cover-letter-start",
      `Drafting cover letter · ${company}`,
      { leadId, company, jobTitle }
    );
    await this.bus.publish("content:cover-letter-start", "content", {
      leadId,
      company,
      jobTitle,
    });

    const systemPrompt = `You are Layla — Salah Nahed's Creative Lead. You write cover letters in his voice: confident, specific, short, no corporate fluff.

HARD RULES (never violate):
1. Never invent relocation plans, scale numbers, percentages, or industry verticals that don't appear in the candidate profile data.
2. Use ONLY the facts in the structured profile data (profile.experience, profile.summary, profile.location). When unsure, omit rather than invent.
3. Open by stating the candidate's actual location relative to the role's location. The candidate's location is in profile.location.

VOICE:
- Never write "seeking new opportunities" or "wealth of experience."
- Lead with a story or a concrete shipped thing from profile.experience.
- End with one sentence that asks for the conversation, not the job.`;

    const userPrompt = `Draft a cover letter for ${company} · ${jobTitle}.${
      fitPercentage != null ? ` Fit score: ${fitPercentage}%.` : ""
    }

Candidate location: ${profile.location}

Structured profile data (this is the ONLY source of facts you may use):
${this.getProfileContext()}
${roleSummary ? `\nRole summary (from job analysis):\n${roleSummary}\n` : ""}
${matched ? `Matched skills (use as evidence — be specific, cite the experience entry it comes from):\n${matched}\n` : ""}${
      missing
        ? `Skill gaps to address briefly without over-apologising: ${missing}\n`
        : ""
    }
Output a single cover letter. ~250–350 words. Plain text, no markdown headings, no salutations like "Dear Hiring Manager" — start with a hook that names the candidate's location relative to the role, end with a CTA.`;

    // We call Claude directly here rather than through the agent's
    // structured-output helper because we want a raw string back,
    // not a JSON-validated schema. Temperature is intentionally low —
    // cover letters need factual fidelity, not creative latitude.
    const reply = await this.callClaudeRaw({
      systemPrompt,
      userPrompt,
      maxTokens: 700,
      temperature: 0.4,
    });

    const text = (reply || "").trim();
    if (!text) {
      throw new Error("Empty cover letter response from model");
    }

    const contentId = saveLeadContent({
      leadId,
      contentType: "cover_letter",
      generatedText: text,
    });

    this.logStep(
      "content:cover-letter-ready",
      `Cover letter ready · ${company} · ${text.length} chars`,
      { leadId, company, contentId, charCount: text.length }
    );
    await this.bus.publish("content:cover-letter-ready", "content", {
      leadId,
      company,
      contentId,
      charCount: text.length,
    });

    // v3 Plan A Phase C+B — Auto-advance the mission state machine
    // ONLY when BOTH artefacts have landed (Layla's cover letter AND
    // Kareem's tailored resume). Whichever agent finishes last is
    // the one whose call flips the row to KIT_READY. Idempotent: if
    // the mission is already KIT_READY/SHIPPED, the helper returns
    // false and we don't double-publish.
    const advanced = advanceToKitReadyIfBothDone(leadId);
    if (advanced) {
      this.logStep(
        "mission:kit-ready",
        `Mission KIT_READY · ${company}`,
        { leadId, company }
      );
      await this.bus.publish("mission:kit-ready", "content", {
        leadId,
        company,
        contentId,
      });
    }
  }

  /** Tiny Claude wrapper — raw text in, raw text out. We keep this
   *  here (rather than at the AIAgent base) because it's specific to
   *  the cover-letter use case where structured output would be
   *  overkill. The base class's `runStructured` is the right tool
   *  for everything else. */
  private async callClaudeRaw(args: {
    systemPrompt: string;
    userPrompt: string;
    maxTokens: number;
    temperature: number;
  }): Promise<string> {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: args.maxTokens,
      temperature: args.temperature,
      system: args.systemPrompt,
      messages: [{ role: "user", content: args.userPrompt }],
    });
    const block = response.content[0];
    return block?.type === "text" ? block.text : "";
  }

  private async draftSocialForHighFit(payload: {
    jobId: string;
    jobTitle: string;
    company: string;
    url: string;
    fitPercentage: number;
    analysis?: {
      matchedSkills?: Array<{ skill: string; evidence?: string }>;
      missingSkills?: string[];
    };
  }): Promise<void> {
    const matched =
      payload.analysis?.matchedSkills?.map((s) => s.skill).slice(0, 5) || [];
    const stackLine = matched.length > 0 ? matched.join(", ") : "mobile development";

    const userPrompt = `Write a 3-sentence LinkedIn post (first-person, casual) where Salah highlights his hands-on experience with ${stackLine} — the exact stack behind a role at ${payload.company}. One concrete achievement from his profile (Flutter Bond 100+ stars / 145+ tests, 90% order-flow stability at WiNCH via 47 XCTest files, AppRouter-UIKit 17 releases) anchors the middle sentence. End with a soft question inviting DMs from teams working on similar stacks. No "looking for a job" language — this is thought leadership, not a plea. Return JSON: { post: string, hashtags: string[] }.`;

    // Short-form, tight budget. We want one paragraph, not an essay.
    const result = await this.analyze(userPrompt, SocialDraftSchema, {
      model: "claude-haiku-4-5-20251001",
      systemOverride:
        "You are a senior mobile engineer drafting a single LinkedIn post. Output JSON matching the schema. Be crisp and confident, not salesy.",
      temperature: 0.5,
      maxTokens: 600,
      runId: this.currentRunId,
    });

    const draft = result.data.post.trim();
    if (!draft) throw new Error("empty draft returned");

    // Human-readable activity row — this is what the Chatter Feed shows.
    this.logStep(
      "ghostwriter:social-draft",
      `LinkedIn draft ready for ${payload.company} (stack: ${stackLine})`,
      {
        jobId: payload.jobId,
        stack: matched,
        draftPreview: draft.slice(0, 160),
      }
    );

    const hashtags = (result.data.hashtags || []).slice(0, 5);

    await this.bus.publish("ghostwriter:social-draft-ready", "content", {
      jobId: payload.jobId,
      jobTitle: payload.jobTitle,
      company: payload.company,
      stack: matched,
      draft,
      hashtags,
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

      this.logStep(
        "fetch",
        `Mining targets: ${reposToAnalyze.map((r) => `${r.owner}/${r.repo}${r.path ? ":" + r.path : ""}`).join(", ")}`,
        { targets: reposToAnalyze }
      );

      for (const { owner, repo, branch, context, path } of reposToAnalyze) {
        const repoName = `${owner}/${repo}${path ? ":" + path : ""}`;
        try {
          // Request gem analysis from GitHub Agent via event bus.
          // `path` narrows the analyzer to a single monorepo package
          // (e.g. "packages/form") so a single gem-mining pass over
          // bond-core surfaces FORM-specific patterns instead of
          // mixing form / network / cache / analytics into one blob.
          const analysis = await this.bus.request<CodeGemsAnalysis>(
            "github:analyze-repo",
            { owner, repo, branch, context, path },
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

            // Generate content for top gems. Mirrors /api/content/mine:
            // one Claude call yields BOTH the prose post AND the
            // BondInfographic image slots, so we can render the PNG
            // immediately and store it on `image_url`. We intentionally
            // do NOT publish `content:linkedin-post-created` here — that
            // event triggers Ghada's SVG path, which Zernio drops on
            // publish. The BondInfographic PNG is THE LinkedIn visual.
            if (gem.suggestedPlatform) {
              try {
                const { postText, imageSlots } = await this.generateGemKit(
                  gem,
                  context || ""
                );

                const contentId = insertGeneratedContent(
                  `gem_${gem.suggestedPlatform}_post`,
                  postText,
                  `gem-${gemId}`
                );

                updateCodeGemContent(gemId, contentId);

                // Render BondInfographic PNG for LinkedIn gems with slots.
                // Failures are logged but never fatal — the post itself
                // is still useful and Zernio will fall through to the
                // code-card endpoint when image_url is unset.
                if (gem.suggestedPlatform === "linkedin" && imageSlots) {
                  try {
                    await fsp.mkdir(INFOGRAPHIC_DIR, { recursive: true });
                    const { png } = await renderInfographic(imageSlots);
                    const localPath = nodePath.join(
                      INFOGRAPHIC_DIR,
                      `${contentId}.png`
                    );
                    await fsp.writeFile(localPath, png);
                    setContentImage(
                      contentId,
                      `/infographics/${contentId}.png`,
                      imageSlots.title
                    );
                  } catch (renderErr) {
                    console.error(
                      `[CodeGems] infographic render failed for gem "${gem.title}":`,
                      renderErr
                    );
                  }
                }

                // Phase 5 — auto-trigger carousel for LinkedIn gems
                // with code. Default-on; CAROUSEL_DISABLED=true in env
                // suppresses globally. Non-fatal: failure here doesn't
                // block the gem's other artefacts (post stays, the
                // BondInfographic PNG is already on disk).
                const carousel = await autoGenerateCarousel(this, {
                  contentId,
                  gem,
                  postText,
                  repoContext: context || undefined,
                });
                if (carousel.ok) {
                  this.logStep(
                    "carousel:rendered",
                    `Carousel for "${gem.title}" — ${carousel.slides} slides, ${carousel.durationMs}ms`,
                    {
                      contentId,
                      brandId: carousel.brandId,
                      slides: carousel.slides,
                    },
                    { durationMs: carousel.durationMs }
                  );
                  // Phase 6 — Telegram preview. Fires before
                  // sendCodeGemDraft so the chat order is: PDF
                  // (visual) → post text + approve buttons (action).
                  // sendDocument failures are non-fatal — the user
                  // can still review via the dashboard.
                  if (carousel.pdfPath && carousel.slides) {
                    try {
                      await telegram.sendCarouselPreview(
                        { title: gem.title, repoName: gem.repoName },
                        carousel.pdfPath,
                        contentId,
                        carousel.slides,
                        carousel.brandId
                      );
                    } catch (tgErr) {
                      console.error(
                        `[CodeGems] telegram carousel preview failed for "${gem.title}":`,
                        tgErr
                      );
                    }
                  }
                } else if (!carousel.skipped) {
                  console.error(
                    `[CodeGems] carousel auto-trigger failed for gem "${gem.title}":`,
                    carousel.error
                  );
                  this.logStep(
                    "carousel:error",
                    `Carousel failed for "${gem.title}": ${(carousel.error || "").slice(0, 120)}`,
                    { contentId, error: carousel.error }
                  );
                }

                // Phase 7 — when Layla rewrote the post for carousel
                // mode, send the rewrite (which is what the publish
                // flow will actually post). The original draft stays
                // in `generated_text` for the card's A/B toggle.
                const draftForTelegram =
                  carousel.ok && carousel.carouselPost
                    ? carousel.carouselPost
                    : postText;
                await telegram.sendCodeGemDraft(
                  { title: gem.title, repoName: gem.repoName, gemType: gem.gemType },
                  draftForTelegram,
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

  /**
   * Assemble the full gem→post prompt. Extracted so the same prompt text is
   * used in both the one-shot generation path and the chat-refinement path
   * (where it becomes the first "user" turn that anchors the conversation).
   *
   * `forChatRefinement` strips the IMAGE SLOTS / JSON envelope sections so
   * the refinement turn isn't tugged toward emitting JSON — chat replies
   * are plain prose only and any JSON pull from the user-turn would
   * outweigh the system override telling Claude not to.
   */
  buildGemPrompt(
    gem: GemForRegeneration,
    repoContext: string,
    opts: { forChatRefinement?: boolean } = {}
  ): string {
    return `Turn this code gem into a ${gem.suggestedPlatform} post.

Gem: ${gem.title}
Repo: ${gem.repoName} (${repoContext || "no additional context"})
File: ${gem.filePath}
Type: ${gem.gemType}
Real problem it solved: ${gem.realProblem}
Why interesting: ${gem.whyInteresting}
Content angle: ${gem.contentAngle}

Implementation code (for YOUR understanding only — do NOT paste into the post body):
\`\`\`
${gem.codeSnippet}
\`\`\`

How it's actually used (for YOUR understanding only — do NOT paste into the post body):
\`\`\`
${gem.usageExample}
\`\`\`

Suggested title: "${gem.suggestedTitle}"

==========================================================================
THE FORMAT — PROSE-ONLY POST + CAROUSEL ANCHOR
==========================================================================
Mantra: post = prose, carousel = code.

The LinkedIn post body is PURE PROSE. It does NOT contain fenced code
blocks. It does NOT contain multi-line code samples. The carousel (a
separate visual companion shipped alongside the post) is where the code
lives. The post hooks the reader and points them to the carousel for
the actual pattern.

==========================================================================
GOLDEN STANDARD — PROSE-ONLY EXAMPLE
==========================================================================
This is the EXACT voice, depth, and structure every gem post must
mirror. Do not paraphrase. Use it as the template that proves the
formula.

>>> BEGIN GOLDEN STANDARD POST >>>

Marketing teams couldn't run effective retargeting campaigns because
Firebase got standard sign_up events while Mixpanel got generic custom
events. Attribution tracking was broken across 10+ production apps.

The issue wasn't the analytics calls themselves — it was that each
provider expected different event formats. Firebase had native
logSignedUp methods, Mixpanel didn't. So business logic had to know
which provider supported which events, creating tight coupling and
inconsistent data.

The breakthrough was treating UnimplementedError not as a failure, but
as a routing signal. When a provider doesn't implement a specific event
method, it gracefully falls back to generic event logging. Providers
can opt-in to native events while maintaining backward compatibility.

The principle: exceptions can be elegant control flow when they
represent capability gaps, not actual errors.

Full pattern in the carousel ↓

Have you found cases where exception-based routing made debugging
harder?

#Flutter #Analytics #CleanCode #MobileDev #Architecture

<<< END GOLDEN STANDARD POST <<<

Notice what makes this work:
- ZERO fenced code blocks. Zero multi-line code. Identifiers like
  \`logSignedUp\` appear as bare prose tokens, not in backticks.
- Concrete people get blocked (marketing teams) — but the persona could
  just as easily be the mobile team itself when the gem solves
  developer-experience pain.
- The mechanism is NAMED in plain English ("UnimplementedError as a
  routing signal") so the reader can picture it without seeing the code.
- The carousel anchor ("Full pattern in the carousel ↓") tells the
  reader exactly where the code lives.
- The closing question is a real architectural tradeoff a peer would DM
  about — not generic "thoughts?" bait.

==========================================================================
WHO IS BLOCKED — PICK THE RIGHT PERSONA FROM THE GEM
==========================================================================
Don't default to marketing. Read realProblem and contentAngle, then pick
whichever persona the gem actually unblocks:

- Marketing / Growth — when the gem affects attribution, retargeting,
  campaign data, conversion (analytics, deep links, event tracking).
- QA / Quality — when the gem affects defect rates, regressions, test
  reliability (deterministic builders, replay tools, contract tests).
- Product / End users — when the gem affects user-visible outcomes
  (latency, crashes, accessibility, feature delivery cadence).
- THE MOBILE TEAM ITSELF — when the gem solves developer-experience or
  architectural pain (caching strategies, build setup, code-gen,
  modular architecture, testability, type-safety, refactor velocity).
  This is the right pick whenever the value is "we ship faster" or
  "our codebase stays sane as it grows".

Force-fitting marketing onto a caching gem is wrong. A caching gem's
real audience is usually mobile devs fighting between speed and
freshness — say so directly.

==========================================================================
STRUCTURE — follow this order
==========================================================================
1. THE PAIN (2-3 sentences) — Open with WHO is blocked and WHY. Be
   specific. Name the people, the constraint, the downstream
   consequence. Quantify if you have a real number from the gem; never
   invent one.
2. THE ROOT CAUSE (1 short paragraph) — In prose, diagnose what made
   the problem hard. No code, no fenced blocks.
3. THE BREAKTHROUGH (1 short paragraph) — Name the mechanism in plain
   English (e.g. "UnimplementedError as a routing signal", "type-safe
   enum dispatch", "cache-then-network as a policy enum"). Tell the
   reader what the pattern IS so they can picture it. Still no code.
4. THE PRINCIPLE (1 sentence) — The takeaway a peer can carry into
   their own work.
5. CAROUSEL ANCHOR — A single line pointing to the carousel for the
   code. Use exactly: "Full pattern in the carousel ↓".
6. THE QUESTION — A peer-DM question, ideally naming the tradeoff.
   "What do you think?" FAILS. "Have you hit cases where exception-based
   routing made debugging harder?" PASSES.
7. HASHTAGS — 3-5 relevant tags after a blank line. Always include the
   specific language/framework. Examples: #Flutter, #iOS, #Swift,
   #Dart, #MobileDev, #CleanCode, #SoftwareArchitecture. Never #coding
   or #programming.

==========================================================================
HARD RULES (mandatory — these are the new contract)
==========================================================================
- NO fenced code blocks (\`\`\`) anywhere in the post body. Zero. The
  carousel owns the code.
- NO multi-line code samples in any form. Not in bullets, not as
  indented blocks, not as plain pasted lines.
- Inline backticked identifiers are allowed only when ABSOLUTELY needed
  to name the mechanism (e.g. \`UnimplementedError\` once). Cap at 0-2
  in the whole post — prefer bare prose tokens.
- The post must include the carousel anchor line ("Full pattern in the
  carousel ↓") in section 5. This is non-negotiable.

==========================================================================
VOICE RULES (mandatory)
==========================================================================
- Direct. No throat-clearing. The first sentence states the problem.
- Mechanism-focused. Tell the reader HOW it works in prose, not how it
  FEELS.
- Banned adjectives (do not appear anywhere in the post): "exciting",
  "revolutionary", "amazing", "powerful", "elegant" (when describing
  your own code), "beautiful" (when describing your own code),
  "game-changing", "seamless", "robust", "leverage" (as a verb),
  "unlock" (as a verb).
- Banned openers: "Ever wondered…", "Let me tell you…", "Buckle up",
  "I'm thrilled to share…", any LinkedIn-influencer cliché.
- Banned closers: "What do you think?", "Thoughts?", "Drop a comment",
  generic engagement-bait.
- Speak like a senior dev at a conference table. Max 1-2 emojis in the
  whole post.

==========================================================================
PERSONA / IMPACT RULE (replaces the old marketing-default rule)
==========================================================================
- Connect the technical pattern to a real-world outcome — but pick the
  persona honestly from the gem's realProblem and contentAngle.
- A caching strategy enum may be about mobile devs needing instant
  loads without sacrificing data freshness — that's a mobile-team pain,
  not a marketing pain. Say so.
- An analytics provider system may be about marketers losing
  retargeting because of inconsistent event names — that's a marketing
  pain. Say so.
- A type-safe asset enum may be about preventing production crashes
  from typos — that's a product/end-user outcome. Say so.

==========================================================================
THE CLARITY TEST (self-check before returning)
==========================================================================
1. Could a Flutter/iOS dev who has never seen this repo describe the
   pattern in their own words after reading? If no, the BREAKTHROUGH
   paragraph needs to be sharper.
2. Did you NAME the mechanism (not just hint at it)? "UnimplementedError
   as a routing signal" PASSES. "A clever pattern" FAILS.
3. Is the question something a peer would actually DM about? Generic
   "thoughts?" FAILS.
4. Did you keep ALL code out of the post body? Search your draft for
   \`\`\` and for multi-line code — if you find any, strip them. The
   carousel owns the code.
5. Did you include the "Full pattern in the carousel ↓" anchor line?

WORD-COUNT DISCIPLINE (LinkedIn only):
- Target 180-230 words (prose is denser than code-padded posts; aim
  shorter). If your draft exceeds 260 words, trim THE PAIN to 2
  sentences before returning.

${gem.suggestedPlatform !== "linkedin" ? "For Medium/Dev.to: the long-form format expects code samples, so the no-code rule above applies to LinkedIn ONLY. On Medium/Dev.to, expand to 800-1200 words with deeper explanation and inline code blocks. Drop the carousel-anchor line on Medium/Dev.to since the code lives in the article itself." : ""}
${opts.forChatRefinement ? `
==========================================================================
RESPONSE FORMAT (CHAT REFINEMENT — STRICT)
==========================================================================
Return the rewritten LinkedIn post text ONLY. Pure prose. No JSON. No
\`linkedInPost\` envelope. No \`imageSlots\` block. No preamble. No
"Here's the updated post:". No code fences wrapping the whole reply.

Your reply must start with the first sentence of THE PAIN section and
end with the hashtags line. If you find yourself about to emit \`{\` or
the word \`linkedInPost\`, you have failed the format — start over and
return prose only.` : `
==========================================================================
IMAGE SLOTS (mandatory for LinkedIn — feeds the BondInfographic PNG)
==========================================================================
Alongside the post you MUST produce a structured \`imageSlots\` object that
gets rendered into a 1080x1350 carousel PNG. The infographic is the visual
companion to the post — they ship together.

Slot rules:
- "project": short repo/package name as it should appear in the header
  badge, e.g. "Bond Form" / "Bond Network" / "Bond Analytics".
- "title": the gem's headline rephrased as a TECHNICAL claim, NOT the
  post's hook. Max 120 chars. Wraps at ~3 lines on the rendered image.
  Good: "Type-Safe Required Field Validation".
  Bad: "Marketing teams couldn't run campaigns…" (that's the hook, not
  the title).
- "code_snippet": 6-20 lines of standalone-readable code that visualises
  the pattern. Should NOT have truncation marks like \`…\`. Should NOT
  reference symbols the reader can't see. Pick the USAGE side, not the
  internals — readers want to see the API they'd call.
- "code_language": one of dart / swift / kotlin / typescript /
  javascript / java / python / objc / rust / go.
- "bullet_points": 3-4 short concrete claims for the "Why it works"
  panel. NOT full sentences. Examples: "Zero provider-specific code",
  "60% faster form setup", "Type-safe at compile time". Each one a
  single one-line claim.
- "footer_text" (optional, max 80 chars): tagline override for the
  author card. Defaults to "iOS · Flutter · Bond Framework" if omitted.

Return JSON with this EXACT structure. Note imageSlots appears FIRST
inside linkedInPost — emit it first (Claude generates left-to-right
and the long "content" field can otherwise truncate it):
{
  "linkedInPost": {
    "imageSlots": {
      "project": "Bond Form",
      "title": "Type-Safe Required Field Validation",
      "code_snippet": "final field = TextFieldState(\\n  validators: [\\n    Rules.required<String>(),\\n    Rules.email(),\\n  ],\\n);",
      "code_language": "dart",
      "bullet_points": [
        "Discoverable API via static factories",
        "Custom messages without touching validation logic",
        "60% faster form setup"
      ],
      "footer_text": "iOS · Flutter · Bond Framework"
    },
    "content": "the full post text",
    "hook": "the attention-grabbing first line",
    "callToAction": "ending question or CTA"
  }
}`}`;
  }

  /**
   * One-shot generation: gem → post text. Used by the mining loop
   * when the caller only needs the prose text. Discards the
   * imageSlots from the response.
   */
  async generatePostFromGem(
    gem: GemForRegeneration,
    repoContext: string
  ): Promise<string> {
    const contentPrompt = this.buildGemPrompt(gem, repoContext);
    const result = await this.analyze(contentPrompt, ContributionContentSchema, { maxTokens: 5000 });
    return result.data.linkedInPost.content;
  }

  /**
   * Full kit generation: gem → both post text AND structured image
   * slots. Used by the targeted mining route so each gem ships with
   * its rendered BondInfographic PNG.
   *
   * Two-pass design:
   *   1. Primary call → post text + (usually) imageSlots in one shot.
   *      Higher maxTokens + imageSlots-first prompt ordering means
   *      Claude usually emits both. ~$0.02-0.04.
   *   2. Retry-on-missing → if imageSlots came back null, fire a
   *      cheap focused call asking ONLY for the slots given the
   *      already-drafted post text. ~$0.01.
   *
   * Net: every gem with a successful primary call walks away with
   * a renderable infographic. Total worst-case ~$0.05/gem.
   */
  async generateGemKit(
    gem: GemForRegeneration,
    repoContext: string
  ): Promise<{
    postText: string;
    imageSlots: NonNullable<ContributionContent["linkedInPost"]["imageSlots"]> | null;
    /** Captured error from the retry pass when imageSlots was missing
     *  from the primary call AND the retry also failed. Surfaced via
     *  the route response so the failure mode is visible. */
    retryError?: string | null;
  }> {
    const contentPrompt = this.buildGemPrompt(gem, repoContext);
    const result = await this.analyze(contentPrompt, ContributionContentSchema, { maxTokens: 5000 });
    const postText = result.data.linkedInPost.content;
    let imageSlots = result.data.linkedInPost.imageSlots ?? null;

    // Retry pass — fires only when the primary call dropped imageSlots.
    // Anchored on the already-generated post text so the slots stay
    // semantically aligned with the prose.
    let retryError: string | null = null;
    if (!imageSlots) {
      try {
        imageSlots = await this.generateImageSlotsFromPost(
          gem,
          repoContext,
          postText
        );
      } catch (err) {
        retryError = err instanceof Error ? err.message : String(err);
        // Loud log so the dropout is visible in dev-server stdout.
        console.error(
          `[generateGemKit] imageSlots retry failed for "${gem.title}": ${retryError}`
        );
      }
    }

    return { postText, imageSlots, retryError };
  }

  /**
   * Focused second-pass — given an already-drafted post, ask Claude
   * to produce just the BondInfographic image slots that visualise
   * it. Used as a recovery path when `generateGemKit`'s primary call
   * truncates before emitting imageSlots. Cheaper and more reliable
   * than re-doing the whole gem.
   */
  private async generateImageSlotsFromPost(
    gem: GemForRegeneration,
    repoContext: string,
    postText: string
  ): Promise<NonNullable<ContributionContent["linkedInPost"]["imageSlots"]>> {
    // We import the slots schema lazily and validate against an
    // outer wrapper { imageSlots: ... } so Claude's JSON shape stays
    // consistent across both passes.
    const { GemImageSlotsSchema } = await import(
      "../schemas/gem-image-slots.schema"
    );
    const wrapperSchema = z.object({ imageSlots: GemImageSlotsSchema });

    const prompt = `You drafted this LinkedIn post for a code gem from ${gem.repoName}${repoContext ? ` (${repoContext.slice(0, 200)})` : ""}.

POST:
"""
${postText.slice(0, 2500)}
"""

Now produce the structured image slots that will render into a 1080x1350 infographic alongside the post. The slots must visually summarise the post — same project, same code pattern, same payoff bullets.

Return JSON with this EXACT structure (and ONLY this — no prose):
{
  "imageSlots": {
    "project": "Bond Form",
    "title": "<the gem's headline as a technical claim — max 120 chars, NOT the post hook>",
    "code_snippet": "<6-20 lines of standalone-readable code from the gem; usage side preferred over implementation>",
    "code_language": "<one of: dart, swift, kotlin, typescript, javascript, java, python, objc, rust, go>",
    "bullet_points": ["<3-4 short concrete claims for the WHY panel — single-line each>"],
    "footer_text": "<optional, max 80 chars; omit for default>"
  }
}`;

    const result = await this.analyze(prompt, wrapperSchema, { maxTokens: 1500 });
    return result.data.imageSlots;
  }

  /**
   * Generate a 4-slide carousel deck from an already-drafted LinkedIn
   * post. Used by the on-demand `POST /api/content/:id/carousel` route
   * — Phase 3 of the carousel feature.
   *
   * Returns a validated `CarouselDeck`. Caller renders + assembles
   * the PDF via the carousel-renderer / pdf-service pair.
   *
   * Anchored on the existing post text so the deck stays semantically
   * aligned with what's already on LinkedIn (or about to ship).
   * Optional gem context tightens the cover/why slides when available.
   */
  async generateCarouselFromContent(input: {
    postText: string;
    project: string;
    repoContext?: string;
    gemTitle?: string;
    realProblem?: string;
    whyInteresting?: string;
    contentAngle?: string;
    defaultFooterText?: string;
    /** Verbatim gem implementation code — only legal source for the
     *  carousel's code slide. Without it Layla invents enum cases. */
    codeSnippet?: string;
    /** Verbatim gem usage example — preferred over `codeSnippet` for
     *  the code slide because readers want to see the API they'd call. */
    usageExample?: string;
  }): Promise<{
    carouselPost: string;
    carousel: NonNullable<ContributionContent["linkedInPost"]["carousel"]>;
  }> {
    const { CarouselDeckSchema } = await import(
      "../schemas/carousel-deck.schema"
    );
    const { buildCarouselPrompt } = await import(
      "../prompts/carousel-prompt"
    );
    // Phase 7 — Layla emits BOTH the narrative-only post rewrite AND
    // the carousel deck in one pass so the two stay anchored on the
    // same reasoning. carouselPost has the same hard bounds as the
    // schema in `contribution-content.schema.ts` so a downstream
    // ContentAIAgent unifying the gem-kit + carousel call (Phase 5
    // future work) gets the same shape.
    const wrapperSchema = z.object({
      carouselPost: z.string().min(300).max(1200),
      carousel: CarouselDeckSchema,
    });
    const prompt = buildCarouselPrompt(input);
    // 5500 tokens covers a 4-slide deck PLUS the ~900-char post
    // rewrite comfortably. Schema caps clip anything longer.
    const result = await this.analyze(prompt, wrapperSchema, {
      maxTokens: 5500,
    });
    return {
      carouselPost: result.data.carouselPost,
      carousel: result.data.carousel,
    };
  }

  /**
   * Chat-style refinement turn. Replays the original gem prompt + current
   * draft as the opening exchange, then whatever prior user/assistant turns
   * the client tracked, then the latest user tip. Returns plain text so Claude
   * doesn't have to re-emit the JSON envelope on every turn.
   *
   * @param gem             The parsed gem object (rebuilds the anchoring context).
   * @param repoContext     Business-context blurb for the source repo.
   * @param currentDraft    Post text to treat as "assistant's first reply" —
   *                        typically what's in the DB when the chat opened.
   * @param chatHistory     Alternating user/assistant turns added by the UI,
   *                        ending with the latest `user` tip.
   */
  async refineGemPostInChat(
    gem: GemForRegeneration,
    repoContext: string,
    currentDraft: string,
    chatHistory: ChatMessage[]
  ): Promise<string> {
    if (chatHistory.length === 0 || chatHistory[chatHistory.length - 1].role !== "user") {
      throw new Error("refineGemPostInChat: chatHistory must end with a user message");
    }

    const latestUserMessage = chatHistory[chatHistory.length - 1].content;
    const priorChat = chatHistory.slice(0, -1);

    const priorMessages: ChatMessage[] = [
      { role: "user", content: this.buildGemPrompt(gem, repoContext, { forChatRefinement: true }) },
      { role: "assistant", content: currentDraft },
      ...priorChat,
    ];

    const systemOverride = `${this.config.systemPrompt}

CHAT MODE RULES (strict — override conflicting rules from the user turn):
- You are iteratively refining a LinkedIn post the user already has.
- The user will give you feedback; rewrite the WHOLE post applying it.
- Respond ONLY with the rewritten post text. Pure prose. No preamble, no code fences around the whole reply, no "Here's the updated post:".
- ABSOLUTELY NO JSON. If your response begins with "{" or contains the substring "linkedInPost" or "imageSlots", you have failed the format. Start your reply with the first sentence of THE PAIN section, end with the hashtags line, and stop.
- Keep the structural rules (pain → root cause → breakthrough → principle → carousel anchor → question → hashtags) unless the user explicitly says to change them.
- The post body is PROSE ONLY — no fenced code blocks, no multi-line code samples. The code lives in the carousel, not in the post. If the current draft still contains fenced code blocks (\`\`\`...\`\`\`) or multi-line code, STRIP them and replace with a "Full pattern in the carousel ↓" anchor plus a prose description of the mechanism. This is non-negotiable even when the user's feedback only asks for a small tweak — the no-code rule overrides preservation of the existing draft's structure.`;

    const result = await this.complete(latestUserMessage, {
      priorMessages,
      systemOverride,
      maxTokens: 2800,
      temperature: 0.7,
    });
    return result.text;
  }

  /**
   * Self-critique a generated post against Salah's clarity bar:
   *   "is this clear enough to publish, or does it read like mysterious code?"
   *
   * Uses Haiku 4.5 (~10x cheaper than Sonnet) and a DIFFERENT critic prompt
   * than the generator, so we don't just get rubber-stamp scores. Grounded in
   * the same Sources context (gem + repo blurb) that Claude used to write it.
   */
  async scoreContent(
    postText: string,
    sources: ContentSourceContext
  ): Promise<ContentScoreRaw> {
    const gem = sources.gem;
    const gemContext = gem
      ? `\nSource gem:
- Title: ${gem.title}
- Type: ${gem.gemType}
- File: ${gem.filePath || "(unknown)"}
- Real problem it solved: ${gem.realProblem || "(not provided)"}
- Why interesting: ${gem.whyInteresting || "(not provided)"}
- Content angle: ${gem.contentAngle || "(not provided)"}
${gem.codeSnippet ? `- Implementation:\n\`\`\`\n${gem.codeSnippet}\n\`\`\`` : ""}
${gem.usageExample ? `- Usage:\n\`\`\`\n${gem.usageExample}\n\`\`\`` : ""}`
      : "\nSource gem: (none — grade the post on its own merits)";

    const repoBlurb = sources.repoContext
      ? `\nRepo business context: ${sources.repoContext}`
      : "";

    const systemPrompt = `You are an experienced dev-content editor grading a LinkedIn post a mobile developer plans to publish.

Your ONLY job is to answer: "Is this clear enough to publish, or does it read like mysterious code?"

A CLEAR post (9-10):
- A Flutter/iOS dev with no prior context can describe what the code does and sketch how they'd apply it in their own app
- Every type/class/name in prose or code is either visible in a code block OR glossed in one line on first mention
- Named concepts ("strategy pattern", "UnimplementedError routing") are shown for one line of code, not just name-dropped
- At least one sentence gives the reader a reason to comment — a tradeoff, a "this felt wrong but…", a controversial call
- The ending question is specific — something a peer would DM about, not "What do you think?"
- 200-250 words, tight paragraphs, no filler

A MYSTERIOUS post (1-4):
- Code blocks reference undefined types/classes, the reader can't guess what they do
- Project-specific names ("Bond framework", \`sl<T>()\`) appear without a "what this is" clause
- Ends with a generic "thoughts?" question
- Feels like reading diff chunks out of context

Be strict. If a peer reader would have to ask "wait, what IS that class?" — score drops. If they'd feel "oh nice, I could use this tomorrow" — score rises.

Tips must be CONCRETE and IMPERATIVE — "Explain what \`sl<T>()\` is on first use" or "Replace the ending question with one asking how teams handle multi-provider analytics". NOT "be clearer" or "add more context".

Respond ONLY with valid JSON matching the requested schema.`;

    const userPrompt = `Grade this LinkedIn post.${gemContext}${repoBlurb}

The post:
---
${postText}
---

Return JSON:
{
  "score": <integer 1-10>,
  "verdict": "clear" | "needs-sharpening" | "mysterious",
  "oneLineVerdict": "<one-sentence explanation>",
  "tips": [<2-5 concrete, imperative tips the author can paste into a chat to fix the post>]
}`;

    const result = await this.analyze(userPrompt, ContentScoreSchema, {
      model: "claude-haiku-4-5-20251001",
      systemOverride: systemPrompt,
      temperature: 0.2,
      maxTokens: 600,
    });
    return result.data;
  }
}
