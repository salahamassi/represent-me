import { z } from "zod/v4";

export const CodeGemsAnalysisSchema = z.object({
  gems: z.array(
    z.object({
      repoName: z.string(),
      filePath: z.string(),
      gemType: z.enum(["pattern", "architecture", "trick", "optimization"]),
      title: z.string(),
      description: z.string(),
      codeSnippet: z.string(),
      usageExample: z.string(),
      realProblem: z.string(),
      whyInteresting: z.string(),
      contentAngle: z.string(),
      suggestedPlatform: z.enum(["linkedin", "medium", "devto"]),
      suggestedTitle: z.string(),
    })
  ),
});

export type CodeGemsAnalysis = z.infer<typeof CodeGemsAnalysisSchema>;
