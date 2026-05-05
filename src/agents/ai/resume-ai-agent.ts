/**
 * AI Resume Agent — Generates tailored PDF resumes per job.
 * Listens on the event bus for "job:high-fit" and "resume:generate" events.
 */

import { AIAgent, type AIAgentConfig } from "../base/ai-agent";
import type { AgentBus } from "../base/agent-bus";
import { ResumeGenerationSchema, type ResumeGeneration } from "../schemas/resume-gen.schema";
import { generateResumePDF } from "@/services/pdf-service";
import {
  insertGeneratedResume,
  linkResumeToJob,
  updateManualLead,
  isLeadApproved,
  getLeadApprovalStatus,
  getLeadResume,
  advanceToKitReadyIfBothDone,
  recordMissionError,
} from "@/lib/db";
import * as telegram from "@/lib/telegram";
import type { AgentResult, Finding, ActionItem } from "@/types";
import type { AIJobAnalysis } from "../schemas/job-analysis.schema";
import type { SaqrLeadAnalysis } from "../schemas/manual-lead.schema";
import { FEATURED_PROJECTS } from "@/data/featured-projects";
import { mediumArticles } from "@/data/medium-data";

interface ResumeRequest {
  jobId: string;
  jobTitle: string;
  company: string;
  url: string;
  fitPercentage: number;
  analysis: AIJobAnalysis;
}

export class ResumeAIAgent extends AIAgent {
  constructor(bus: AgentBus) {
    const config: AIAgentConfig = {
      id: "resume",
      name: "AI Resume Agent",
      systemPrompt: "",
      temperature: 0.4,
      maxTokens: 3000,
    };
    super(config, bus);

    this.config.systemPrompt = `You are an expert resume writer and career consultant.

You are writing resumes for this candidate:
${this.getProfileContext()}

Your task: Generate a tailored resume structure optimized for a specific job.
Rules:
- Voice: write in Salah's technical voice — direct, mechanism-focused, quantified. NO ADJECTIVES. Lead with the mechanism, not praise. BAD: "Expertly developed a robust framework". GOOD: "Engineered a protocol-based navigation framework, cutting boilerplate by 40%". Every bullet uses Action + Context + Result.
- Rewrite bullet points to emphasize relevant experience
- Reorder skills to match job requirements
- Craft a summary that directly addresses the job's needs
- Highlight transferable skills and quantified achievements
- Use action verbs and quantified results
- Concision target: max 2 pages. Achieve this by trimming OLD experience and shortening bullets — never by cutting PROJECTS or PUBLICATIONS.
- Do NOT fabricate experience — only reframe existing experience`;

    // Listen for high-fit jobs → generate resume IF approved.
    // Approval gate: Salah must explicitly approve in the Command Bar
    // before any kit work happens. Without the gate, every high-fit
    // hit would burn Claude tokens on a kit Salah may not want.
    this.bus.subscribe("job:high-fit", async (event) => {
      const data = event.payload as ResumeRequest;
      const status = getLeadApprovalStatus(data.jobId);
      if (!isLeadApproved(status)) {
        console.log(
          `[ResumeAgent] Job ${data.jobId} pending approval — standby.`
        );
        this.logStep(
          "amin:standby",
          `On standby for ${data.company} · awaiting approval`,
          { jobId: data.jobId, approvalStatus: status }
        );
        return;
      }
      console.log(`[ResumeAgent] High-fit job approved: ${data.jobTitle} — generating resume...`);
      await this.generateForJob(data);
    });

    // Listen for user-approved resume generation
    this.bus.subscribe("resume:generate", async (event) => {
      const data = event.payload as { jobId: string; source: string };
      console.log(`[ResumeAgent] Resume requested for job ${data.jobId}`);
      // In a full implementation, we'd look up the job details from DB
      // For now, acknowledge the request
      await telegram.sendMessage(`Resume generation requested for job ${data.jobId}. Processing...`);
    });

    // Register as responder for synchronous resume requests
    this.bus.respond("resume:generate-sync", async (payload) => {
      const data = payload as ResumeRequest;
      return await this.generateForJob(data);
    });

    // Phase 6 — Obeida Workflow: Amin's kit generation. Fires after
    // Saqr's analysis lands. We shim Saqr's SaqrLeadAnalysis into the
    // ResumeRequest shape `generateForJob` already knows how to handle,
    // then generate a cover letter separately with a lighter Haiku call.
    // v3 Plan A Phase B — Mission start subscriber. The unified
    // Trigger / Approve flow publishes `mission:started` whenever
    // `seen_jobs.mission_status` flips to IN_PROGRESS. Kareem owns
    // the tailored CV here. After the resume row lands he checks
    // the composite "both done?" gate and flips KIT_READY if Layla
    // already finished her cover letter (or vice-versa — whichever
    // agent wraps last is the one that advances the state).
    //
    // Idempotency: if a generated_resumes row already exists for
    // this job_id (e.g. the legacy `job:high-fit` path fired first
    // through the same `/approve` route), we skip — no double-bill.
    this.bus.subscribe("mission:started", async (event) => {
      const data = event.payload as {
        leadId: string;
        company: string;
        jobTitle: string;
        url: string | null;
        fitPercentage: number | null;
        analysis: AIJobAnalysis | null;
        startedAt: string;
      };

      // Idempotent guard — if a resume already exists for this
      // job, don't regenerate (would duplicate Claude cost).
      if (getLeadResume(data.leadId)) {
        console.log(
          `[Kareem/Amin] mission:started — resume already exists for ${data.leadId}, skipping`
        );
        // Still check the kit-ready gate in case Layla finished
        // while we were idle and we're the LAST agent to ack.
        const advanced = advanceToKitReadyIfBothDone(data.leadId);
        if (advanced) {
          await this.bus.publish("mission:kit-ready", "resume", {
            leadId: data.leadId,
            company: data.company,
          });
        }
        return;
      }

      if (!data.analysis) {
        // No analysis on the row — can't tailor without it. Log + surface
        // as a soft error on the lead row so the LeadDetail panel can
        // offer a "Force-advance to KIT_READY" override (Salah ships
        // with no tailored CV) or a "Re-run analysis" path.
        console.warn(
          `[Kareem] mission:started — no ai_analysis for ${data.leadId}, can't tailor CV`
        );
        this.logStep(
          "amin:cv-skip-no-analysis",
          `Skipped CV tailoring · ${data.company} · no ai_analysis on row`,
          { leadId: data.leadId, company: data.company }
        );
        recordMissionError(
          data.leadId,
          "kareem",
          "no ai_analysis on this lead — re-run job-matcher first, or force-advance to ship without tailored CV"
        );
        return;
      }

      console.log(
        `[Kareem/Amin] mission:started — tailoring CV for ${data.company}`
      );
      this.logStep(
        "amin:mission-start",
        `Tailoring CV · ${data.company}`,
        { leadId: data.leadId, company: data.company }
      );

      // v3 Plan A Phase G — Symmetric "start" event so the SSE bridge
      // can pop a "Tailoring CV…" bubble into Yusuf's chat the moment
      // Kareem begins. Mirrors Layla's `content:cover-letter-start`.
      await this.bus.publish("resume:cv-start", "resume", {
        leadId: data.leadId,
        company: data.company,
      });

      try {
        await this.generateForJob({
          jobId: data.leadId,
          jobTitle: data.jobTitle,
          company: data.company,
          url: data.url || "",
          fitPercentage: data.fitPercentage ?? 0,
          analysis: data.analysis,
        });

        await this.bus.publish("resume:cv-ready", "resume", {
          leadId: data.leadId,
          company: data.company,
        });

        // Composite advance — whichever agent finishes last flips
        // the mission to KIT_READY. Idempotent.
        const advanced = advanceToKitReadyIfBothDone(data.leadId);
        if (advanced) {
          this.logStep(
            "mission:kit-ready",
            `Mission KIT_READY · ${data.company}`,
            { leadId: data.leadId, company: data.company }
          );
          await this.bus.publish("mission:kit-ready", "resume", {
            leadId: data.leadId,
            company: data.company,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Kareem] CV tailoring failed:", err);
        this.logStep(
          "amin:cv-error",
          `CV tailoring failed: ${msg.slice(0, 120)}`,
          { leadId: data.leadId, error: msg.slice(0, 500) }
        );
        recordMissionError(data.leadId, "kareem", msg);
      }
    });

    this.bus.subscribeOnce("resume:manual-lead:analyzed", "manual-lead:analyzed", async (event) => {
      const data = event.payload as {
        leadId: string;
        jdText: string;
        url: string | null;
        jobTitle: string;
        company: string;
        contactName: string | null;
        fitPercentage: number;
        analysis: SaqrLeadAnalysis;
      };
      // Approval gate — same as the job:high-fit branch above.
      const status = getLeadApprovalStatus(data.leadId);
      if (!isLeadApproved(status)) {
        console.log(`[Amin] Manual lead ${data.leadId} pending approval — standby.`);
        this.logStep(
          "amin:standby",
          `On standby for ${data.company} · awaiting approval`,
          { leadId: data.leadId, approvalStatus: status }
        );
        return;
      }
      console.log(`[Amin] Manual lead analyzed — preparing kit for ${data.company}…`);
      try {
        await this.prepareManualLeadKit(data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Amin] Manual-lead kit failed:", err);
        this.logStep("amin:manual-lead-error", `Kit failed: ${msg.slice(0, 120)}`, {
          leadId: data.leadId,
          error: msg.slice(0, 500),
        });
        updateManualLead(data.leadId, { kitStatus: "error" });
      }
    });
  }

  /**
   * Amin's kit builder for the Obeida Workflow. Produces:
   *   1. A tailored resume PDF (reuses generateForJob — Saqr's output
   *      maps cleanly onto its ResumeRequest contract).
   *   2. A short, plain-text cover letter that references the referrer
   *      when one is present. Markdown-friendly, Claude-written.
   */
  private async prepareManualLeadKit(data: {
    leadId: string;
    jdText: string;
    url: string | null;
    jobTitle: string;
    company: string;
    contactName: string | null;
    fitPercentage: number;
    analysis: SaqrLeadAnalysis;
  }): Promise<void> {
    const { leadId, jdText, url, jobTitle, company, contactName, fitPercentage, analysis } = data;

    // Map Saqr's schema onto the AIJobAnalysis shape generateForJob
    // expects. The fields line up 1:1 — we just add a reasoning string
    // so downstream formatters don't choke on an empty field.
    const shimmed: AIJobAnalysis = {
      fitPercentage,
      reasoning: analysis.summary,
      matchedSkills: analysis.matchedSkills,
      transferableSkills: analysis.transferableSkills,
      missingSkills: analysis.missingSkills,
      resumeEmphasis: analysis.resumeEmphasis,
      applicationTips: analysis.applicationTips,
    } as AIJobAnalysis;

    const request: ResumeRequest = {
      jobId: leadId,
      jobTitle,
      company,
      url: url || "",
      fitPercentage,
      analysis: shimmed,
    };

    // Step 1: tailored resume PDF. generateForJob persists its own DB
    // rows (generated_resumes, resume_id on seen_jobs) so we only need
    // to pick up the pdfPath for the manual-lead row.
    const { pdfPath } = await this.generateForJob(request);

    // Step 2: cover letter. Separate Haiku pass — cheaper, and the
    // resume prompt above already ate most of the context budget.
    const coverLetter = await this.draftCoverLetterForLead({
      jdText,
      jobTitle,
      company,
      contactName,
      analysis,
    });

    updateManualLead(leadId, {
      kitResumePath: pdfPath,
      coverLetterText: coverLetter,
      kitStatus: "kit-ready",
    });

    // Human-friendly chatter row.
    this.logStep(
      "amin:manual-lead-kit",
      `Kit ready for ${company} — resume + cover letter`,
      { leadId, company, jobTitle, resumePath: pdfPath, coverLetterLength: coverLetter.length }
    );

    await this.bus.publish("manual-lead:kit-ready", "resume", {
      leadId,
      company,
      jobTitle,
      resumePath: pdfPath,
      coverLetterLength: coverLetter.length,
    });
  }

  /**
   * Write a short, warm cover letter in Salah's voice. Plain text /
   * markdown-friendly — no envelope or formal headers because the user
   * will paste into LinkedIn / email directly.
   */
  private async draftCoverLetterForLead(args: {
    jdText: string;
    jobTitle: string;
    company: string;
    contactName: string | null;
    analysis: SaqrLeadAnalysis;
  }): Promise<string> {
    const { jdText, jobTitle, company, contactName, analysis } = args;
    const isObeida =
      !!contactName && contactName.toLowerCase().includes("obeida");

    const prompt = `Write a cover letter for Salah applying to "${jobTitle}" at ${company}.

Context:
${
  contactName
    ? `- Referrer: ${contactName}${isObeida ? " (Salah's former student from 5 years ago)" : ""}`
    : "- No named referrer."
}
- Summary of role: ${analysis.summary}
- Key Success Factors: ${analysis.keySuccessFactors.join("; ")}
- Salah's matched strengths: ${analysis.matchedSkills.map((s) => s.skill).join(", ")}

Rules:
- Plain text, no markdown headers, no "Dear Hiring Manager".
- 3 paragraphs, ~250 words total.
- Open by establishing credibility on ONE of the Key Success Factors with a concrete past achievement (Flutter Bond 100+ stars, WiNCH stability work, AppRouter-UIKit, 5-agent AI dashboard). Pick the most relevant.
- Middle paragraph: what specifically draws him to ${company} and how he'd contribute in the first 90 days.
- Close: one-sentence invitation to talk. Confident, not salesy.
${isObeida ? "- Somewhere in the opening, briefly acknowledge the referrer in a way that feels earned (\"I was glad to hear from Obeida about this role\") — warm but not gushing." : ""}
- No "I am writing to apply" phrasing. Never apologize for anything.

JD excerpt:
"""
${jdText.slice(0, 2000)}
"""

Return JUST the cover letter text. No JSON wrapper, no preamble.`;

    if (!this.client) {
      // Claude isn't configured — ship a minimal stub so the kit still
      // downloads. Better to give Salah a starter than nothing.
      return `Dear ${company} team,\n\n[Cover letter generation needs ANTHROPIC_API_KEY. Resume attached separately.]\n\nBest,\nSalah`;
    }

    const reply = await this.client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      temperature: 0.6,
      system:
        "You are drafting a cover letter in Salah Nahed's voice. Salah is a senior mobile engineer (Swift, Flutter, iOS architecture, AI integration). Be specific, confident, never salesy. Output plain text only.",
      messages: [{ role: "user", content: prompt }],
    });
    const text =
      reply.content.find((b) => b.type === "text")?.type === "text"
        ? (reply.content.find((b) => b.type === "text") as { type: "text"; text: string }).text
        : "";
    return text.trim();
  }

  async run(context?: Record<string, unknown>): Promise<AgentResult> {
    this.currentRunId = context?.runId as number | undefined;
    // The resume agent is primarily event-driven.
    // When run directly, it provides general resume advice.
    return {
      findings: [{
        id: "resume-ready",
        agentId: "resume",
        severity: "info",
        title: "Resume Agent is active",
        description: "Listening for job matches to generate tailored resumes automatically.",
        category: "status",
      }],
      actionItems: [],
    };
  }

  async generateForJob(request: ResumeRequest): Promise<{
    pdfPath: string;
    resumeData: ResumeGeneration;
  }> {
    const { analysis, jobId, jobTitle, company, url, fitPercentage } = request;

    // Today's date — fed into the prompt so Claude's "older than 5 years"
    // gates do real date math instead of inferring from the most-recent
    // role's period (which historically caused ITG, an iOS role 4.4 years
    // old, to be mis-classified as "old enough to drop").
    const TODAY = new Date().toISOString().slice(0, 10);

    // v3 — Featured projects with REAL URLs. Claude picks 2–4 most
    // relevant per role and copies the URL verbatim into the schema's
    // `url` field. Without this, projects render with no link → user
    // sees "Flutter Bond Framework — description" with no proof.
    const projectsBlock = FEATURED_PROJECTS.map(
      (p) =>
        `- ${p.name} (tags: ${p.tags.join(",")}) — ${p.blurb} | url: ${p.url}`
    ).join("\n");

    // v4 — Publications block kept SEPARATE from projects so Claude
    // can tag-match against the role. iOS roles → only iOS/Swift/UIKit
    // articles; Flutter roles → only Flutter/Dart articles. Keeps the
    // PROJECTS section clean (no Medium articles bleeding in).
    const publicationsBlock = mediumArticles
      .map(
        (a) =>
          `- ${a.title} (tags: ${a.tags.join(",")}) | url: ${a.url} | date: ${a.publishDate}`
      )
      .join("\n");

    // Generate tailored resume structure via Claude
    const prompt = `Generate a tailored resume for this job:

Today's date: ${TODAY}
Job Title: ${jobTitle}
Company: ${company}
Fit: ${fitPercentage}%

AI Analysis says to emphasize:
${analysis.resumeEmphasis.join("\n")}

Matched skills: ${analysis.matchedSkills.map((s) => `${s.skill} (${s.evidence})`).join(", ")}
Transferable skills: ${analysis.transferableSkills.map((s) => `${s.transferFrom} → ${s.required}`).join(", ")}
Missing skills (de-emphasize): ${analysis.missingSkills.join(", ")}

Application tips: ${analysis.applicationTips}

Salah's featured public PROJECTS (GitHub repos and merged PRs — use REAL
URLs from this list, do NOT invent URLs, do NOT omit URLs when picking
from this list):
${projectsBlock}

Salah's PUBLICATIONS (technical articles — keep SEPARATE from projects):
${publicationsBlock}

Return a JSON object with this EXACT structure:
{
  "summary": "2-3 sentence tailored summary for this role",
  "targetRole": "${jobTitle}",
  "experienceEntries": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "period": "MM/YYYY - MM/YYYY",
      "bullets": ["Achievement 1", "Achievement 2"],
      "technologies": ["Swift", "Flutter"],
      "employmentType": "contract"
    }
  ],
  "skillsGrouped": [
    {"category": "Mobile Development", "items": ["Swift", "Flutter", "Dart"]}
  ],
  "highlightedProjects": [
    {"name": "Project Name", "description": "Why it's relevant", "url": "https://github.com/..."}
  ],
  "publications": [
    {"title": "Article Title", "url": "https://medium.com/...", "date": "2025-03-30"}
  ],
  "education": [
    {"degree": "Bachelor's in IT", "institution": "Islamic University of Gaza", "period": "2014-2018"}
  ]
}

CRITICAL:
- experienceEntries: ARRAY of objects. Each MUST have "company", "title", "period" (string), "bullets" (array of strings), "technologies" (array of strings). MAY have "employmentType" (enum: "full-time" | "contract" | "part-time" | "freelance").
- Bullet length: each bullet MUST be ≤ 20 words. Use Action + Context + Result. NO ADJECTIVES.
- Quantification + Honesty (HARD, this rule OVERRIDES every other quantification instinct):
  • ≥50% of bullets across all experienceEntries should contain a number — but ONLY numbers that are quotable verbatim from the candidate profile context shown in your system prompt. Acceptable sources: profile.summary, profile.keyAchievements, profile.experience.highlights, profile.openSource (e.g. "7+ years", "100+ GitHub stars", "145+ tests", "47 XCTest files", "30% efficiency", "90% order flow stability", "thousands of users daily", "17 releases", "24 XCTest cases", "2 months", "4 navigation types", "10+ themes", "5 minutes").
  • If you cannot cite a number from the profile, WRITE THE BULLET WITHOUT A NUMBER. A bullet without a number that's true beats a bullet with a number that's invented. Fewer-but-honest > more-but-fabricated.
  • FORBIDDEN: any specific count, percentage, ratio, duration, or scale figure that does not appear in the profile context. Examples of fabrications you must NOT introduce: "5000+ drivers", "99.9% uptime", "50,000 MAU", "10,000 daily users", "user retention by 45%", "open rates 40%", "fraud reduced by 80%", "1000+ concurrent users", "engagement up 30%" (unless that exact figure is in the profile, which it isn't), "5 portfolio companies".
  • If the profile says "thousands of users daily", you may write "thousands of users daily" verbatim — you may NOT promote it to "5000+ users" or "8000 daily users". The profile's vagueness is intentional; preserve it.
  • Numerical preservation: if the profile says "100+ stars", write "100+ stars" — not "100 stars" or "200+ stars".
  • Self-check before returning: scan every number in your output. For each, can you find that exact number in the candidate profile above? If no, REWRITE that bullet without the number. Hallucinating numbers is the single worst failure mode of this resume generator — never do it.
- Keyword Mirror: when the JD uses a verb that honestly describes the candidate's work, USE THAT EXACT VERB instead of a synonym. Common JD verbs to mirror: developed, designed, supported, validated, enhanced, expanded, assisted, directed, improved, tested, maintained, prepped, integrated, shipped. Don't write "built" if the JD says "developed" for the same activity.
- Keyword Bridge: if the JD lists a term the candidate has via a sibling technology, surface the JD's EXACT term in a bullet or in skillsGrouped. Examples: JD "NoSQL" + candidate Firebase Firestore → "Firebase Firestore (NoSQL)"; JD "GCP" / "Google Cloud" + candidate Firebase → "Firebase (GCP)"; JD "Data Structures" + candidate skills include "Algorithms, Data Structures" → keep that exact phrasing; JD "Middleware" + candidate has API/backend integration → label bullets as "middleware integration". Never invent capabilities the candidate lacks — only relabel existing ones using the JD's vocabulary when honest.
- Performance language: when the JD mentions "performance tests" / "profiling" / "optimization" / "performance" and the candidate has efficiency wins (30% efficiency at Nologystore, memory-leak detection at WiNCH, golden tests catching regressions), use the JD's exact words — "performance", "profiling" — verbatim in those bullets. Don't paraphrase as "efficiency".
- Maintenance language: for any experienceEntry with tenure ≥ 1 year (or with employmentType "contract" implying ongoing engagement), include at least one bullet using JD verbs about post-deployment work — "maintained", "supported", "monitored", "validated" — when honest. Maps to JD lines like "Maintaining and supporting releases post deployment".
- Release-Ownership Keywords (HARD RULE when JD requires shipping experience): whenever an experienceEntry involved shipping a mobile app and the JD has language like "Shipped at least 1 app to the iOS App Store and/or Google Play Store", that entry MUST include at least one bullet using one of these explicit phrases verbatim: "App Store", "iOS App Store", "Google Play", "Play Store", "shipped to", "published to", "release builds", "validated release". Don't write "in production" or "live" — write "shipped to App Store" or "validated Play Store release builds".
- Industry-Vertical Bridge: when the JD's company operates in a specific vertical (telehealth, fintech, e-commerce, gaming, logistics, ed-tech, etc.), scan the candidate's history for any work in adjacent verticals and surface the connection in BOTH the summary AND the relevant experienceEntry's first bullet. Examples: telehealth role + Famcare (mental-health teletherapy with Agora video sessions) → "Patient-focused telehealth product experience" in summary, "telehealth platform" in Famcare bullets; fintech role + Hesabi (telecom self-service / SIM activation / Keychain refresh tokens) → "transaction-handling production app at scale" framing.
- Employment-type pass-through: copy each experienceEntry's "employmentType" verbatim from the candidate profile data. This contextualizes short tenures (e.g. a 4-month contract) so recruiters don't read them as job-hopping. Omit the field for full-time roles (it's the implicit default).
- Technologies cap: each experienceEntry.technologies list MUST be ≤ 6 items — keep architectural pillars, drop minor libraries.
- Relevance floor (HARD): NEVER omit any experienceEntry whose end date is within 5 years of today (${TODAY}). For "Present" roles treat the end date as today. The MINIMUM count of experienceEntries you must include is the COUNT of profile roles whose end date is within the past 5 years — you may NOT drop below that floor. Compute the dates carefully. A role that ended in 12/2021 is ~4.4 years before May 2026, which is WITHIN 5 years and MUST be kept.
- iOS-stack keep rule (HARD): if the JD or "${jobTitle}" mentions any of [iOS, Swift, UIKit, SwiftUI, Objective-C, Xcode, Apple, Mobile, Tech Lead Mobile], EVERY profile experienceEntry that worked on those technologies MUST appear in your output regardless of date. Examples on this candidate: WiNCH, ITG, Famcare, Trivia, One Studio. ITG specifically owns unique evidence (Keychain + Face ID biometric refresh tokens, real-time identity verification, multi-theme UI) that no other role has — it MUST be included for any iOS-flavored role.
- Relevance trimming (allowed ONLY for older roles): an experienceEntry may be omitted ONLY if ALL of these are true: (a) its end date is strictly more than 5 years before ${TODAY}; (b) its primary stack is fully covered by a more-recent role; (c) it provides no unique evidence for the JD (no security pattern, no domain, no framework, no quantified outcome); (d) the iOS-stack keep rule above does not apply. When in any doubt, KEEP the role with 1-2 tight bullets.
- Word-count allocation: allocate ~70% of total word count to the most recent 3 years, ~25% to roles 3-5 years old, ~5% to anything older. Allocation is about emphasis (bullet count), NOT inclusion — every recent role still gets at least one bullet.
- skillsGrouped: ARRAY of objects (NOT a single object).
- education: ARRAY of objects (NOT a single object).
- highlightedProjects: ARRAY of objects, each MUST include {name, description, url}. Pick 4-6 from the PROJECTS block by ARCHITECTURAL OVERLAP with the role — for Lead/Senior/Architect/Principal/Staff roles favour Frameworks and OSS Contributions over simple App repos; for IC/Mid roles favour work that demonstrates the role's day-to-day mechanics. Copy the url EXACTLY. NEVER put a Medium article here; articles go in "publications".
- publications: ARRAY of objects with {title, url, date}. Pick 2-4 from the PUBLICATIONS block whose tags overlap the role (iOS role → iOS/Swift/UIKit; Flutter role → Flutter/Dart). If nothing matches return an empty array. Copy url and date EXACTLY.
- NEVER cut the PROJECTS or PUBLICATIONS sections to save page space — the page budget comes from trimming old experience and bullet length, not from omitting proof of work.
- Only reframe existing experience, don't fabricate.`;

    const result = await this.analyze(prompt, ResumeGenerationSchema);
    const resumeData = result.data;

    // Generate PDF
    const pdfPath = await generateResumePDF(resumeData, jobId, jobTitle);

    // Save to DB
    const resumeId = insertGeneratedResume({
      jobId,
      jobTitle,
      company,
      fitPercentage,
      pdfPath,
      aiAnalysis: JSON.stringify(analysis),
      resumeData: JSON.stringify(resumeData),
    });

    linkResumeToJob(jobId, resumeId);

    // Send to Telegram with PDF
    await this.sendResumeNotification(request, pdfPath);

    // Publish completion event
    await this.bus.publish("resume:ready", "resume", {
      jobId,
      pdfPath,
      resumeId,
    });

    return { pdfPath, resumeData };
  }

  private async sendResumeNotification(request: ResumeRequest, pdfPath: string) {
    const { jobTitle, company, fitPercentage, analysis, url } = request;

    // First send the analysis message
    const text = [
      `<b>📄 Resume Generated — ${fitPercentage}% Match</b>`,
      ``,
      `<b>${jobTitle}</b> at ${company}`,
      ``,
      `<b>Why you fit:</b> ${analysis.reasoning.slice(0, 200)}`,
      ``,
      `Key emphasis:`,
      ...analysis.resumeEmphasis.slice(0, 3).map((e) => `• ${e}`),
      ``,
      `<a href="${url}">View Job</a>`,
      ``,
      `📎 PDF resume attached below.`,
    ].join("\n");

    await telegram.sendMessage(text);

    // Send the PDF
    await telegram.sendDocument(pdfPath, `Resume for ${jobTitle} at ${company}`);
  }
}
