/**
 * AI Resume Agent — Generates tailored PDF resumes per job.
 * Listens on the event bus for "job:high-fit" and "resume:generate" events.
 */

import { AIAgent, type AIAgentConfig } from "../base/ai-agent";
import type { AgentBus } from "../base/agent-bus";
import { ResumeGenerationSchema, type ResumeGeneration } from "../schemas/resume-gen.schema";
import { generateResumePDF } from "@/services/pdf-service";
import { insertGeneratedResume, linkResumeToJob } from "@/lib/db";
import * as telegram from "@/lib/telegram";
import type { AgentResult, Finding, ActionItem } from "@/types";
import type { AIJobAnalysis } from "../schemas/job-analysis.schema";

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
- Rewrite bullet points to emphasize relevant experience
- Reorder skills to match job requirements
- Craft a summary that directly addresses the job's needs
- Highlight transferable skills and quantified achievements
- Keep it concise (max 2 pages worth of content)
- Use action verbs and quantified results
- Do NOT fabricate experience — only reframe existing experience`;

    // Listen for high-fit jobs → auto-generate resume
    this.bus.subscribe("job:high-fit", async (event) => {
      const data = event.payload as ResumeRequest;
      console.log(`[ResumeAgent] High-fit job detected: ${data.jobTitle} — generating resume...`);
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

    // Generate tailored resume structure via Claude
    const prompt = `Generate a tailored resume for this job:

Job Title: ${jobTitle}
Company: ${company}
Fit: ${fitPercentage}%

AI Analysis says to emphasize:
${analysis.resumeEmphasis.join("\n")}

Matched skills: ${analysis.matchedSkills.map((s) => `${s.skill} (${s.evidence})`).join(", ")}
Transferable skills: ${analysis.transferableSkills.map((s) => `${s.transferFrom} → ${s.required}`).join(", ")}
Missing skills (de-emphasize): ${analysis.missingSkills.join(", ")}

Application tips: ${analysis.applicationTips}

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
      "technologies": ["Swift", "Flutter"]
    }
  ],
  "skillsGrouped": [
    {"category": "Mobile Development", "items": ["Swift", "Flutter", "Dart"]}
  ],
  "highlightedProjects": [
    {"name": "Project Name", "description": "Why it's relevant"}
  ],
  "education": [
    {"degree": "Bachelor's in IT", "institution": "Islamic University of Gaza", "period": "2014-2018"}
  ]
}

CRITICAL:
- experienceEntries: ARRAY of objects. Each MUST have "company", "title", "period" (string), "bullets" (array of strings), "technologies" (array of strings)
- skillsGrouped: ARRAY of objects (NOT a single object)
- education: ARRAY of objects (NOT a single object)
- highlightedProjects: ARRAY of objects
- Only reframe existing experience, don't fabricate`;

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
