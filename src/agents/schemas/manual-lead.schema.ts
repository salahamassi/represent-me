/**
 * Zod schemas for the manual-lead consultation chain (Phase 6).
 *
 * - Saqr analyzes the raw JD and extracts exactly 3 Key Success Factors
 *   plus a concise role summary.
 * - Qalam takes that analysis and produces a proactive chat brief (the
 *   "vibe check" line shown in the Chatter Feed) + a recommendation-
 *   request draft, when a referrer / student context is provided.
 *
 * Both schemas are kept small and strict — we want the agents to produce
 * predictable, parse-safe output every time; creativity lives inside the
 * string fields, not in the shape.
 */

import { z } from "zod/v4";

export const SaqrLeadAnalysisSchema = z.object({
  jobTitle: z.string().min(1).describe("Best-effort job title extracted from the JD."),
  company: z.string().min(1).describe("Company name extracted from the JD, or 'Unknown'."),
  summary: z
    .string()
    .min(20)
    .max(400)
    .describe("One-paragraph summary of the role — what it IS, not a bullet list."),
  keySuccessFactors: z
    .array(z.string().min(4))
    .length(3)
    .describe(
      "Exactly 3 factors that will determine success in this role. Crisp, actionable, first-person-friendly."
    ),
  matchedSkills: z
    .array(z.object({ skill: z.string(), evidence: z.string() }))
    .describe("Skills Salah clearly has that map to the JD — with his evidence."),
  transferableSkills: z
    .array(z.object({
      required: z.string(),
      transferFrom: z.string(),
      confidence: z.enum(["high", "medium", "low"]),
    }))
    .describe("Required skills Salah lacks but could transfer from adjacent tech."),
  missingSkills: z.array(z.string()).describe("Hard gaps — skills Salah does not have."),
  fitPercentage: z.number().int().min(0).max(100).describe("Overall fit, 0–100."),
  resumeEmphasis: z
    .array(z.string())
    .describe("What the tailored resume should lead with. Short phrases."),
  applicationTips: z
    .string()
    .describe("One sentence of tactical advice for the application."),
});
export type SaqrLeadAnalysis = z.infer<typeof SaqrLeadAnalysisSchema>;

export const QalamLeadBriefSchema = z.object({
  chatBrief: z
    .string()
    .min(40)
    .max(700)
    .describe(
      "Qalam's first-person chat message to Salah. Warm, creative, names the contact if present. 3–5 sentences. Always ends with a soft question offering to draft the recommendation."
    ),
  recommendationRequestDraft: z
    .string()
    .min(80)
    .describe(
      "Plain-text draft of a short recommendation request Salah could send to the referrer. When context mentions a former student (e.g. Obeida), lean into the teacher→mentor dynamic."
    ),
});
export type QalamLeadBrief = z.infer<typeof QalamLeadBriefSchema>;
