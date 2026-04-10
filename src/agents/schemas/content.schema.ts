import { z } from "zod/v4";

export const ContentGenerationSchema = z.object({
  articleIdeas: z.array(
    z.object({
      title: z.string(),
      targetPlatform: z.enum(["medium", "devto", "linkedin"]),
      difficulty: z.enum(["beginner", "intermediate", "advanced"]),
      estimatedReadTime: z.string(),
      outline: z.array(z.string()),
      rationale: z.string(),
      tags: z.array(z.string()),
    })
  ),
  linkedInPost: z.object({
    content: z.string(),
    hook: z.string(),
    callToAction: z.string(),
  }),
  trendingTopics: z.array(z.string()),
  contentGaps: z.array(z.string()),
});

export type ContentGeneration = z.infer<typeof ContentGenerationSchema>;
