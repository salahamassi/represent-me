import { z } from "zod/v4";

export const LinkedInAnalysisSchema = z.object({
  optimizedHeadline: z.string(),
  optimizedAbout: z.string(),
  featuredItems: z.array(
    z.object({
      title: z.string(),
      type: z.enum(["article", "project", "repo", "publication"]),
      url: z.string(),
      reason: z.string(),
    })
  ),
  keywordRecommendations: z.array(
    z.object({
      keyword: z.string(),
      importance: z.enum(["critical", "recommended", "nice-to-have"]),
      reason: z.string(),
    })
  ),
  contentCalendar: z.array(
    z.object({
      week: z.number(),
      topic: z.string(),
      type: z.enum(["post", "article", "share", "poll"]),
      brief: z.string(),
    })
  ),
  overallScore: z.number().min(0).max(100),
});

export type LinkedInAnalysis = z.infer<typeof LinkedInAnalysisSchema>;
