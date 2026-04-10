import { z } from "zod/v4";

export const ResumeGenerationSchema = z.object({
  summary: z.string(),
  targetRole: z.string(),
  experienceEntries: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      period: z.string(),
      bullets: z.array(z.string()),
      technologies: z.array(z.string()),
    })
  ),
  skillsGrouped: z.array(
    z.object({
      category: z.string(),
      items: z.array(z.string()),
    })
  ),
  highlightedProjects: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
    })
  ),
  education: z.array(
    z.object({
      degree: z.string(),
      institution: z.string(),
      period: z.string(),
    })
  ),
});

export type ResumeGeneration = z.infer<typeof ResumeGenerationSchema>;
