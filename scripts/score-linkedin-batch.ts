#!/usr/bin/env tsx
/**
 * One-shot batch scorer for the LinkedIn jobs we just bulk-scraped into
 * seen_jobs. Replicates JobMatcherAIAgent.analyzeJob's prompt + schema
 * but bypasses the agent's 10-job slice cap so all rows get scored.
 *
 * Usage:
 *   npx tsx scripts/score-linkedin-batch.ts
 *
 * Filters rows by:
 *   id LIKE 'linkedin-%' AND ai_analysis IS NULL AND user_action IS NULL
 *
 * Already-applied rows (e.g. LifeMD with user_action='applied') are
 * skipped — no point re-scoring something we already shipped.
 *
 * Concurrency 3 (mirrors the agent's batch pattern). Per-call cost is
 * ~$0.005, so a 50-job batch is ~$0.25–0.40. Wallclock ~2 minutes.
 */

import Anthropic from "@anthropic-ai/sdk";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { profile } from "../src/data/profile";
import { jobPreferences } from "../src/data/job-preferences";
import {
  AIJobAnalysisSchema,
  type AIJobAnalysis,
} from "../src/agents/schemas/job-analysis.schema";

// .env.local loader (Claude Code env can override; force read).
try {
  const env = fs.readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
  if (!/^ANTHROPIC_BASE_URL=/m.test(env)) delete process.env.ANTHROPIC_BASE_URL;
} catch {
  /* fall through to env-var check */
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ERROR: ANTHROPIC_API_KEY not set");
  process.exit(1);
}

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const DB_PATH = path.join(PROJECT_ROOT, "data", "represent-me.db");
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Build the same candidate context block the JobMatcher's system prompt
// uses. Skills + experience headlines + key achievements are the high-
// signal slice — we don't need every Famcare bullet for fit scoring.
function buildCandidateContext(): string {
  const skillsBlock = profile.skills
    .map((g) => `${g.category}: ${g.items.join(", ")}`)
    .join("\n");
  const experienceBlock = profile.experience
    .slice(0, 5) // most recent 5 — older roles add noise to fit scoring
    .map(
      (e) =>
        `- ${e.title} @ ${e.company} (${e.period}): ${e.description.slice(0, 120)}`
    )
    .join("\n");
  const targets = jobPreferences.targetRoles.slice(0, 6).join(", ");
  return `Candidate: ${profile.name}
Headline role: ${profile.role}
Location: ${profile.location}

Summary:
${profile.summary}

Skills:
${skillsBlock}

Recent experience:
${experienceBlock}

Target roles right now: ${targets}`;
}

const SYSTEM_PROMPT = `You are an expert recruiter and resume strategist. Score job fit honestly and quantitatively for the candidate below. Return strict JSON only — no markdown fences, no preamble.

${buildCandidateContext()}

Scoring rules:
- fitPercentage: 0-100, calibrated to actual stack overlap. Don't inflate.
- 85+ = top-shelf fit, ready to apply today.
- 60-84 = moderate, worth tailoring.
- 30-59 = stretch / transferable.
- <30 = noise, don't waste effort.
- Heavy Flutter/iOS/Swift/UIKit experience is a strong match.
- Native GCP/AWS, gRPC, native Android-only roles, ML/AI training-data labeling roles are weak matches.
- Senior + Architecture + Framework background = +5 for senior+ roles.
- Telehealth / health-tech is a domain match (Famcare proof).`;

interface JobRow {
  id: string;
  title: string;
  company: string;
  url: string;
  jd_text: string;
}

async function analyzeOne(job: JobRow): Promise<AIJobAnalysis> {
  const prompt = `Analyze this job posting:

Job Title: ${job.title}
Company: ${job.company}
URL: ${job.url}

Description (full JD text):
"""
${job.jd_text.slice(0, 6000)}
"""

Return JSON matching this exact shape (camelCase keys):
{
  "fitPercentage": 0-100 number,
  "reasoning": "2-3 sentences",
  "matchedSkills": [{"skill": "Flutter", "evidence": "4+ years across Trivia + Famcare"}],
  "transferableSkills": [{"required": "GCP", "transferFrom": "Firebase + Code Magic", "confidence": "medium"}],
  "missingSkills": ["string"],
  "salaryEstimate": {"min": 4000, "max": 7000, "currency": "USD", "confidence": "medium"},
  "resumeEmphasis": ["bullet points the resume should foreground"],
  "applicationTips": "single string"
}`;

  const reply = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    temperature: 0.3,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
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
  return AIJobAnalysisSchema.parse(parsed);
}

async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const runners: Promise<void>[] = [];
  for (let i = 0; i < limit; i++) {
    runners.push(
      (async () => {
        while (true) {
          const idx = cursor++;
          if (idx >= items.length) return;
          out[idx] = await worker(items[idx], idx);
        }
      })()
    );
  }
  await Promise.all(runners);
  return out;
}

async function main() {
  const db = new Database(DB_PATH);

  const rows = db
    .prepare(
      `SELECT id, title, company, url, jd_text
       FROM seen_jobs
       WHERE (id LIKE 'linkedin-%' OR id LIKE 'manual-%')
         AND ai_analysis IS NULL
         AND user_action IS NULL
         AND jd_text IS NOT NULL
       ORDER BY id`
    )
    .all() as JobRow[];

  console.log(`Scoring ${rows.length} jobs (concurrency 3)…\n`);
  const start = Date.now();
  let done = 0;
  const failures: { id: string; err: string }[] = [];

  type Result = { id: string; ok: true; analysis: AIJobAnalysis } | {
    id: string;
    ok: false;
    err: string;
  };

  const results = await withConcurrency<JobRow, Result>(rows, 3, async (job) => {
    try {
      const analysis = await analyzeOne(job);
      done++;
      const fit = analysis.fitPercentage.toString().padStart(3);
      console.log(
        `  [${done.toString().padStart(2)}/${rows.length}] ${fit}%  ${job.title.slice(0, 50)} @ ${job.company.slice(0, 25)}`
      );
      return { id: job.id, ok: true, analysis };
    } catch (err) {
      done++;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ id: job.id, err: msg });
      console.log(
        `  [${done.toString().padStart(2)}/${rows.length}] FAIL  ${job.title.slice(0, 50)} — ${msg.slice(0, 80)}`
      );
      return { id: job.id, ok: false, err: msg };
    }
  });

  // Persist results in a single transaction.
  const update = db.prepare(
    `UPDATE seen_jobs
     SET fit_percentage = ?,
         ai_analysis = ?,
         matched_skills = ?,
         missing_skills = ?,
         salary_estimate = ?
     WHERE id = ?`
  );
  const tx = db.transaction((items: typeof results) => {
    for (const r of items) {
      if (!r.ok) continue;
      const a = r.analysis;
      update.run(
        a.fitPercentage,
        JSON.stringify(a),
        JSON.stringify(a.matchedSkills.map((s) => s.skill)),
        JSON.stringify(a.missingSkills),
        a.salaryEstimate
          ? `${a.salaryEstimate.currency} ${a.salaryEstimate.min}-${a.salaryEstimate.max}`
          : null,
        r.id
      );
    }
  });
  tx(results);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `\nDone in ${elapsed}s · ${results.filter((r) => r.ok).length} scored, ${failures.length} failed.`
  );

  // Leaderboard.
  const leaderboard = db
    .prepare(
      `SELECT id, title, company, fit_percentage, salary_estimate
       FROM seen_jobs
       WHERE id LIKE 'linkedin-%' AND fit_percentage IS NOT NULL
       ORDER BY fit_percentage DESC`
    )
    .all() as Array<{
    id: string;
    title: string;
    company: string;
    fit_percentage: number;
    salary_estimate: string | null;
  }>;

  console.log("\n=== TOP-20 by fit % ===");
  for (const r of leaderboard.slice(0, 20)) {
    const fit = r.fit_percentage.toString().padStart(3);
    const salary = r.salary_estimate ? `  [${r.salary_estimate}]` : "";
    console.log(
      `  ${fit}%  ${r.id.replace("linkedin-", "")}  ${r.title.slice(0, 48)} @ ${r.company.slice(0, 22)}${salary}`
    );
  }

  console.log(`\n=== Distribution ===`);
  const buckets = { high: 0, mid: 0, low: 0, noise: 0 };
  for (const r of leaderboard) {
    if (r.fit_percentage >= 85) buckets.high++;
    else if (r.fit_percentage >= 60) buckets.mid++;
    else if (r.fit_percentage >= 30) buckets.low++;
    else buckets.noise++;
  }
  console.log(`  85+ (apply now):       ${buckets.high}`);
  console.log(`  60-84 (worth tailoring): ${buckets.mid}`);
  console.log(`  30-59 (stretch):       ${buckets.low}`);
  console.log(`  <30 (noise):           ${buckets.noise}`);

  db.close();
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
