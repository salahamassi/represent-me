import { z } from "zod/v4";

export const ContributionContentSchema = z.object({
  linkedInPost: z.object({
    content: z.string(),
    hook: z.string(),
    callToAction: z.string(),
  }),
  mediumArticle: z
    .object({
      title: z.string(),
      sections: z.array(
        z.object({
          heading: z.string(),
          content: z.string(),
        })
      ),
      tags: z.array(z.string()),
    })
    .optional(),
  devtoArticle: z
    .object({
      title: z.string(),
      content: z.string(),
      tags: z.array(z.string()),
    })
    .optional(),
});

export type ContributionContent = z.infer<typeof ContributionContentSchema>;
