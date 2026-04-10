import { z } from "zod/v4";

export const GitHubAnalysisSchema = z.object({
  profileRecommendations: z.object({
    bio: z.string(),
    company: z.string(),
    pinnedRepos: z.array(z.string()),
  }),
  repoInsights: z.array(
    z.object({
      name: z.string(),
      action: z.enum(["improve", "archive", "feature", "leave"]),
      reasoning: z.string(),
      readmeSuggestion: z.string().optional(),
    })
  ),
  contributionStrategy: z.object({
    weeklyGoal: z.string(),
    focusAreas: z.array(z.string()),
    recommendations: z.array(z.string()),
  }),
  overallScore: z.number().min(0).max(100),
});

export type GitHubAnalysis = z.infer<typeof GitHubAnalysisSchema>;

export const ReadmeGenerationSchema = z.object({
  readme: z.string(),
  highlights: z.array(z.string()),
});

export type ReadmeGeneration = z.infer<typeof ReadmeGenerationSchema>;

export const WeeklyReportSchema = z.object({
  summary: z.string(),
  newStars: z.number(),
  reposUpdated: z.array(z.string()),
  contributionStreak: z.string(),
  topFindings: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export type WeeklyReport = z.infer<typeof WeeklyReportSchema>;
