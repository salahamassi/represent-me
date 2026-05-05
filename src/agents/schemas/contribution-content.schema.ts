import { z } from "zod/v4";
import { GemImageSlotsSchema } from "./gem-image-slots.schema";
import { CarouselDeckSchema } from "./carousel-deck.schema";

export const ContributionContentSchema = z.object({
  linkedInPost: z.object({
    content: z.string(),
    hook: z.string(),
    callToAction: z.string(),
    /** Structured slots for the BondInfographic PNG renderer. Optional
     *  for backwards compat with non-gem content paths; gem-mining
     *  requires it (validated post-call by the route). */
    imageSlots: GemImageSlotsSchema.optional(),
    /** Multi-slide PDF carousel deck. Phase 3 ships an on-demand
     *  generator that produces this from an existing post; Phase 5
     *  will wire it into the primary gem-kit call so new posts land
     *  with both fields populated. */
    carousel: CarouselDeckSchema.optional(),
    /** Phase 7 — narrative-only post body that sits ABOVE the
     *  carousel deck on LinkedIn. Replaces the original code-heavy
     *  draft for display + publish purposes; the original is kept
     *  for A/B in `generated_text`. ~600-950 chars target. */
    carouselPost: z.string().min(300).max(1200).optional(),
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
