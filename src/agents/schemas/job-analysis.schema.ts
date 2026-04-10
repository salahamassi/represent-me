import { z } from "zod/v4";

export const AIJobAnalysisSchema = z.object({
  fitPercentage: z.number().min(0).max(100),
  reasoning: z.string(),
  matchedSkills: z.array(
    z.object({
      skill: z.string(),
      evidence: z.string(),
    })
  ),
  transferableSkills: z.array(
    z.object({
      required: z.string(),
      transferFrom: z.string(),
      confidence: z.enum(["high", "medium", "low"]),
    })
  ),
  missingSkills: z.array(z.string()),
  salaryEstimate: z
    .object({
      min: z.number(),
      max: z.number(),
      currency: z.string(),
      confidence: z.enum(["high", "medium", "low"]),
    })
    .optional(),
  resumeEmphasis: z.array(z.string()),
  applicationTips: z.string(),
});

export type AIJobAnalysis = z.infer<typeof AIJobAnalysisSchema>;
