import { z } from "zod/v4";

export const IssueAnalysisSchema = z.object({
  issueType: z.enum(["bug", "feature", "enhancement", "documentation", "refactor"]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  estimatedHours: z.number(),
  relevantSkills: z.array(z.string()),
  skillMatch: z.number().min(0).max(100),
  approachSummary: z.string(),
  approachSteps: z.array(z.string()),
  filesToModify: z.array(z.string()).optional(),
  potentialChallenges: z.array(z.string()),
  learningValue: z.string(),
  contentPotential: z.enum(["high", "medium", "low"]),
});

export type IssueAnalysis = z.infer<typeof IssueAnalysisSchema>;
