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
      /** Mirrors profile.experience[i].employmentType so the rendered
       *  CV can append "(Contract)" / "(Freelance)" suffixes — important
       *  for explaining short tenures (e.g. Trivia 4 months) without
       *  the recruiter assuming job-hopping. Optional;
       *  "full-time" is implicit (no suffix rendered). */
      employmentType: z
        .enum(["full-time", "contract", "part-time", "freelance"])
        .optional(),
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
      /** v3 — Public URL (GitHub repo, article, demo) so the rendered
       *  resume can show "github.com/x/y" alongside the project name.
       *  Optional because not every project has a public link. */
      url: z.string().optional(),
    })
  ),
  /** Role-relevant publications (Medium articles, Dev.to posts).
   *  Claude tag-matches against the target role and picks 2–4. Empty
   *  array is fine when no publication maps to the role's tags. */
  publications: z
    .array(
      z.object({
        title: z.string(),
        url: z.string().optional(),
        date: z.string().optional(),
      })
    )
    .optional(),
  education: z.array(
    z.object({
      degree: z.string(),
      institution: z.string(),
      period: z.string(),
    })
  ),
});

export type ResumeGeneration = z.infer<typeof ResumeGenerationSchema>;
