#!/usr/bin/env tsx
/**
 * Anti-hallucination smoke test for Layla's cover-letter generator.
 *
 * Reproduces the prompt that
 *   src/agents/ai/content-ai-agent.ts → draftCoverLetterForLead
 * builds, runs it against a Cairo-based mock lead, and asserts the
 * output is location-honest and fact-grounded:
 *   - mentions Cairo (the location-relative opener landed)
 *   - never says UK / London / "relocating" / "ride-hailing"
 *   - never invents the fabricated stats from the LifeMD incident
 *
 * Trade-off: the script duplicates the prompt construction inline so it
 * doesn't have to instantiate the agent and touch SQLite. If the
 * production prompt in draftCoverLetterForLead changes, update this
 * file in lockstep — otherwise it'll silently drift.
 *
 * Run:
 *   ANTHROPIC_API_KEY=... npx tsx scripts/verify-layla-cairo.ts
 *
 * Exits 0 on PASS, 1 on FAIL.
 */

import Anthropic from "@anthropic-ai/sdk";
import { profile } from "../src/data/profile";

// Mirror of getProfileContext() from src/agents/base/ai-agent.ts.
function getProfileContext(): string {
  const exp = profile.experience
    .map(
      (e) =>
        `${e.title} at ${e.company} (${e.period}) — ${e.technologies.join(", ")}`
    )
    .join("\n");

  const skills = profile.skills
    .map((s) => `${s.category}: ${s.items.join(", ")}`)
    .join("\n");

  return `
Name: ${profile.name}
Role: ${profile.role}
Location: ${profile.location}

Experience:
${exp}

Skills:
${skills}

Education: ${profile.education.map((e) => `${e.degree} from ${e.institution}`).join(", ")}

Open Source: ${profile.openSource.map((o) => o.name).join(", ")}
Publications: ${profile.publications.map((p) => p.title).join(", ")}
`;
}

const cairoLead = {
  company: "LifeMD Egypt",
  jobTitle: "Senior Mobile Engineer",
  fitPercentage: 82,
  analysis: {
    summary:
      "LifeMD Egypt is hiring a Senior Mobile Engineer based in Cairo to lead Flutter development on their telehealth patient app. Hybrid role from their Maadi office — three days on-site, two remote.",
    matchedSkills: [
      {
        skill: "Flutter",
        evidence: "Bond framework (100+ stars), Trivia, Famcare telehealth",
      },
      {
        skill: "iOS / Swift",
        evidence: "WiNCHKSA contract, AppRouter-UIKit",
      },
      {
        skill: "Telehealth domain",
        evidence: "Famcare therapy platform — Agora video, subscription billing",
      },
      {
        skill: "CI/CD",
        evidence: "Code Magic across Trivia + Famcare + WiNCH variants",
      },
    ],
    missingSkills: ["Kotlin Multiplatform"],
  },
};

const matched = cairoLead.analysis.matchedSkills
  .slice(0, 4)
  .map((s) => `- ${s.skill}${s.evidence ? ` (${s.evidence})` : ""}`)
  .join("\n");
const missing = cairoLead.analysis.missingSkills.slice(0, 3).join(", ");
const roleSummary = cairoLead.analysis.summary.trim();

const systemPrompt = `You are Layla — Salah Nahed's Creative Lead. You write cover letters in his voice: confident, specific, short, no corporate fluff.

HARD RULES (never violate):
1. Never invent relocation plans, scale numbers, percentages, or industry verticals that don't appear in the candidate profile data.
2. Use ONLY the facts in the structured profile data (profile.experience, profile.summary, profile.location). When unsure, omit rather than invent.
3. Open by stating the candidate's actual location relative to the role's location. The candidate's location is in profile.location.

VOICE:
- Never write "seeking new opportunities" or "wealth of experience."
- Lead with a story or a concrete shipped thing from profile.experience.
- End with one sentence that asks for the conversation, not the job.`;

const userPrompt = `Draft a cover letter for ${cairoLead.company} · ${cairoLead.jobTitle}. Fit score: ${cairoLead.fitPercentage}%.

Candidate location: ${profile.location}

Structured profile data (this is the ONLY source of facts you may use):
${getProfileContext()}

Role summary (from job analysis):
${roleSummary}

Matched skills (use as evidence — be specific, cite the experience entry it comes from):
${matched}

Skill gaps to address briefly without over-apologising: ${missing}

Output a single cover letter. ~250–350 words. Plain text, no markdown headings, no salutations like "Dear Hiring Manager" — start with a hook that names the candidate's location relative to the role, end with a CTA.`;

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set in env. Aborting.");
    process.exit(2);
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 700,
    temperature: 0.4,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = response.content[0];
  const text = block?.type === "text" ? block.text.trim() : "";

  console.log("\n=== Generated cover letter ===\n");
  console.log(text);
  console.log("\n=== Verification ===\n");

  const failures: string[] = [];

  if (!/cairo/i.test(text)) {
    failures.push('Missing required token: "Cairo" (location-relative opener did not land)');
  }

  const bannedTokens = /\b(UK|London|relocat|ride.?hailing)\b/i;
  const bannedMatch = text.match(bannedTokens);
  if (bannedMatch) {
    failures.push(`Banned token present: "${bannedMatch[0]}"`);
  }

  const fabricatedStats = /(40\s*%\s*load|sub-second|concurrent rides|thousands of concurrent)/i;
  const fabMatch = text.match(fabricatedStats);
  if (fabMatch) {
    failures.push(`Fabricated stat present: "${fabMatch[0]}"`);
  }

  if (failures.length > 0) {
    console.log("FAIL:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  } else {
    console.log("PASS — Cairo mentioned, no banned tokens, no fabricated stats.");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Script error:", err);
  process.exit(2);
});
