#!/usr/bin/env tsx
/**
 * One-shot test bench for the tailored-resume pipeline (J.P. Morgan iOS role).
 *
 * Mirrors scripts/test-lifemd-resume.ts but pinned to the JPMorgan
 * Nutmeg iOS Developer JD. Runs:
 *   1. A Saqr-equivalent analyzer call (produces AIJobAnalysis).
 *   2. Kareem's verbatim system + per-job prompt (produces ResumeGeneration).
 *   3. The existing scripts/generate-pdf.js renderer.
 *
 * No DB writes, no event bus, no war-room state — pure prompt-output test.
 *
 * Usage:
 *   npx tsx scripts/test-jpmorgan-resume.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

try {
  const env = fs.readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const [, key, raw] = m;
    process.env[key] = raw.trim().replace(/^['"]|['"]$/g, "");
  }
  if (!/^ANTHROPIC_BASE_URL=/m.test(env)) delete process.env.ANTHROPIC_BASE_URL;
} catch {
  /* file may not exist in CI — fall through to env-var check below */
}

import { profile } from "../src/data/profile";
import { FEATURED_PROJECTS } from "../src/data/featured-projects";
import { mediumArticles } from "../src/data/medium-data";
import {
  AIJobAnalysisSchema,
  type AIJobAnalysis,
} from "../src/agents/schemas/job-analysis.schema";
import {
  ResumeGenerationSchema,
  type ResumeGeneration,
} from "../src/agents/schemas/resume-gen.schema";

const JD_PATH = "/tmp/jpmorgan-jd-clean.txt";
const JOB_TITLE = "iOS Developer";
const COMPANY = "J.P. Morgan";
const JOB_URL = "";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ERROR: ANTHROPIC_API_KEY not set");
  process.exit(1);
}
if (!fs.existsSync(JD_PATH)) {
  console.error(`ERROR: JD file not found at ${JD_PATH}`);
  process.exit(1);
}

const jdText = fs.readFileSync(JD_PATH, "utf8").trim();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

function buildProfileContext(): string {
  const skillsBlock = profile.skills
    .map((g) => `${g.category}: ${g.items.join(", ")}`)
    .join("\n");
  const experienceBlock = profile.experience
    .map(
      (e) =>
        `${e.title} at ${e.company} (${e.period}, ${e.location}):\n  ${e.description}\n  - ${e.highlights.join("\n  - ")}\n  Tech: ${e.technologies.join(", ")}`
    )
    .join("\n\n");
  const openSourceBlock = profile.openSource
    .map((o) => `- ${o.name}: ${o.description}${o.url ? ` (${o.url})` : ""}`)
    .join("\n");
  const publicationsBlock = profile.publications
    .map((p) => `- ${p.title} · ${p.platform}${p.date ? ` · ${p.date}` : ""}`)
    .join("\n");
  return `Name: ${profile.name}
Role: ${profile.role}
Location: ${profile.location}
Email: ${profile.email}
Phone: ${profile.phone}

Summary:
${profile.summary}

Experience:
${experienceBlock}

Skills:
${skillsBlock}

Open Source:
${openSourceBlock}

Publications:
${publicationsBlock}

Education:
${profile.education.map((e) => `${e.degree} — ${e.institution} (${e.period})`).join("\n")}`;
}

async function analyzeJob(): Promise<AIJobAnalysis> {
  const profileContext = buildProfileContext();

  const system = `You are an expert recruiter and resume strategist. Given a candidate profile and a job description, produce a strict, honest analysis that another agent will use to tailor a resume.

Candidate profile:
${profileContext}`;

  const user = `Analyze the fit between this candidate and the role below. Return ONLY valid JSON matching the schema — no preamble, no markdown fences.

JOB TITLE: ${JOB_TITLE}
COMPANY: ${COMPANY}
URL: ${JOB_URL}

JOB DESCRIPTION:
"""
${jdText}
"""

Schema:
{
  "fitPercentage": number 0-100,
  "reasoning": "2-3 sentences on the overall fit",
  "matchedSkills": [{"skill": "Swift", "evidence": "specific role/project where this is proven"}],
  "transferableSkills": [{"required": "JD requirement", "transferFrom": "candidate's adjacent experience", "confidence": "low|medium|high"}],
  "missingSkills": ["any required skills the candidate lacks"],
  "salaryEstimate": {"min": 0, "max": 0, "currency": "GBP", "confidence": "low|medium|high"},
  "resumeEmphasis": ["concrete things from the candidate's history to foreground"],
  "applicationTips": "1-2 sentences on how to position the candidate"
}

Rules:
- Be honest about misses. Examine the JD's REQUIRED skills carefully against the candidate's actual history.
- matchedSkills: only include skills with concrete evidence from the candidate profile (specific role, repo, or shipped artifact). No generic claims.
- transferableSkills: pair each JD requirement with the candidate's nearest analogue and rate confidence honestly.
- resumeEmphasis: 4-6 bullet points that the resume should foreground. NOT generic ("strong communication") — concrete things from the candidate's history.
- salaryEstimate: use the JD's location to pick a realistic currency and band.
- Return JSON only.`;

  console.log("→ Claude call #1: job analysis...");
  const reply = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    temperature: 0.3,
    system,
    messages: [{ role: "user", content: user }],
  });
  const text =
    reply.content.find((b) => b.type === "text")?.type === "text"
      ? (reply.content.find((b) => b.type === "text") as {
          type: "text";
          text: string;
        }).text
      : "";

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  const parsed = JSON.parse(cleaned);
  const validated = AIJobAnalysisSchema.parse(parsed);
  console.log(
    `  ✓ analysis ok — fit ${validated.fitPercentage}%, ${validated.matchedSkills.length} matched, ${validated.missingSkills.length} missing`
  );
  return validated;
}

async function generateResume(
  analysis: AIJobAnalysis
): Promise<ResumeGeneration> {
  const system = `You are an expert resume writer and career consultant.

You are writing resumes for this candidate:
${buildProfileContext()}

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

  const projectsBlock = FEATURED_PROJECTS.map(
    (p) =>
      `- ${p.name} (tags: ${p.tags.join(",")}) — ${p.blurb} | url: ${p.url}`
  ).join("\n");
  const publicationsBlock = mediumArticles
    .map(
      (a) =>
        `- ${a.title} (tags: ${a.tags.join(",")}) | url: ${a.url} | date: ${a.publishDate}`
    )
    .join("\n");

  const userPrompt = `Generate a tailored resume for this job:

Job Title: ${JOB_TITLE}
Company: ${COMPANY}
Fit: ${analysis.fitPercentage}%

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
  "targetRole": "${JOB_TITLE}",
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
- Relevance floor (HARD): NEVER omit any experienceEntry whose end date is within 5 years of today. For "Present" roles treat the end date as today. The MINIMUM count of experienceEntries you must include is the COUNT of profile roles whose end date is within the past 5 years — you may NOT drop below that floor. Compute the dates carefully. A role that ended in 12/2021 is ~4.4 years before May 2026, which is WITHIN 5 years and MUST be kept.
- iOS-stack keep rule (HARD): if the JD or "${JOB_TITLE}" mentions any of [iOS, Swift, UIKit, SwiftUI, Objective-C, Xcode, Apple, Mobile, Tech Lead Mobile], EVERY profile experienceEntry that worked on those technologies MUST appear in your output regardless of date. ITG specifically owns unique evidence (Keychain + Face ID biometric refresh tokens, real-time identity verification, multi-theme UI) that no other role has — it MUST be included for any iOS-flavored role.
- Relevance trimming (allowed ONLY for older roles): an experienceEntry may be omitted ONLY if ALL of these are true: (a) its end date is strictly more than 5 years before today; (b) its primary stack is fully covered by a more-recent role; (c) it provides no unique evidence for the JD; (d) the iOS-stack keep rule above does not apply. When in any doubt, KEEP the role with 1-2 tight bullets.
- Word-count allocation: allocate ~70% of total word count to the most recent 3 years, ~25% to roles 3-5 years old, ~5% to anything older. Allocation is about emphasis (bullet count), NOT inclusion — every recent role still gets at least one bullet.
- skillsGrouped: ARRAY of objects (NOT a single object).
- education: ARRAY of objects (NOT a single object).
- highlightedProjects: ARRAY of objects, each MUST include {name, description, url}. Pick 4-6 from the PROJECTS block by ARCHITECTURAL OVERLAP with the role — for Lead/Senior/Architect/Principal/Staff roles favour Frameworks and OSS Contributions over simple App repos; for IC/Mid roles favour work that demonstrates the role's day-to-day mechanics. Copy the url EXACTLY. NEVER put a Medium article here; articles go in "publications".
- publications: ARRAY of objects with {title, url, date}. Pick 2-4 from the PUBLICATIONS block whose tags overlap the role (iOS role → iOS/Swift/UIKit; Flutter role → Flutter/Dart). If nothing matches return an empty array. Copy url and date EXACTLY.
- NEVER cut the PROJECTS or PUBLICATIONS sections to save page space — the page budget comes from trimming old experience and bullet length, not from omitting proof of work.
- Only reframe existing experience, don't fabricate.`;

  console.log("→ Claude call #2: resume generation (Kareem)...");
  const reply = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    temperature: 0.4,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });
  const text =
    reply.content.find((b) => b.type === "text")?.type === "text"
      ? (reply.content.find((b) => b.type === "text") as {
          type: "text";
          text: string;
        }).text
      : "";

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  const parsed = JSON.parse(cleaned);
  const validated = ResumeGenerationSchema.parse(parsed);
  console.log(
    `  ✓ resume ok — ${validated.experienceEntries.length} roles, ${validated.highlightedProjects.length} projects, ${(validated.publications ?? []).length} publications`
  );
  return validated;
}

function renderPdf(
  resume: ResumeGeneration,
  outputPdfPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmpJson = path.join(
      os.tmpdir(),
      `kareem-test-${Date.now()}.json`
    );
    fs.writeFileSync(
      tmpJson,
      JSON.stringify({ resume, profile, jobTitle: JOB_TITLE })
    );
    const scriptPath = path.join(PROJECT_ROOT, "scripts", "generate-pdf.js");
    const child = spawn("node", [scriptPath, outputPdfPath, tmpJson], {
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("error", reject);
    child.on("exit", (code) => {
      try {
        fs.unlinkSync(tmpJson);
      } catch {
        /* ignore */
      }
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `generate-pdf.js exited ${code}: ${stderr || "(no stderr)"}`
          )
        );
    });
  });
}

async function main() {
  const ts = Date.now();
  const outDir = path.join(PROJECT_ROOT, "data", "resumes");
  fs.mkdirSync(outDir, { recursive: true });

  const analysis = await analyzeJob();
  const analysisDump = path.join(
    os.tmpdir(),
    `test-jpmorgan-${ts}-analysis.json`
  );
  fs.writeFileSync(analysisDump, JSON.stringify(analysis, null, 2));

  const resume = await generateResume(analysis);
  const resumeDump = path.join(os.tmpdir(), `test-jpmorgan-${ts}-resume.json`);
  fs.writeFileSync(resumeDump, JSON.stringify(resume, null, 2));

  const pdfPath = path.join(outDir, `test-jpmorgan-${ts}.pdf`);
  await renderPdf(resume, pdfPath);
  const sizeKb = (fs.statSync(pdfPath).size / 1024).toFixed(1);

  console.log("\n=== DONE ===");
  console.log(`Analysis JSON:  ${analysisDump}`);
  console.log(`Resume JSON:    ${resumeDump}`);
  console.log(`PDF:            ${pdfPath} (${sizeKb} KB)`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
