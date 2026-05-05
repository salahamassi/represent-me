import { z } from "zod/v4";

/**
 * Schema for Claude's self-critique of a generated content post.
 *
 * The score answers Salah's quality bar: "is this clear enough to publish,
 * or does it look like mysterious code a reader can't follow?" Tips are
 * short, actionable, and copy-pasteable into the Refine-in-chat textarea.
 */
export const ContentScoreSchema = z.object({
  /** 1 (mysterious, not publishable) … 10 (clear, ready to publish) */
  score: z.number().int().min(1).max(10),

  /** High-level bucket — drives the colour of the score badge. */
  verdict: z.enum(["clear", "needs-sharpening", "mysterious"]),

  /** One sentence explaining the verdict, shown under the score. */
  oneLineVerdict: z.string().min(1).max(400),

  /**
   * 2-5 concrete, imperative tips the user can feed back into the chat.
   * Each tip should be self-contained ("Explain what `sl<T>()` is on first use")
   * rather than vague ("be clearer").
   */
  tips: z.array(z.string().min(1).max(500)).min(2).max(5),
});

export type ContentScore = z.infer<typeof ContentScoreSchema>;
