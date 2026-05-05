import { z } from "zod/v4";

/**
 * Structured slots Layla emits alongside the prose post. Feeds the
 * BondInfographic JSX template via the Satori renderer so each
 * gem produces both `(post.txt + 1080x1350.png)` in one drafting pass.
 *
 * Lengths are bounded so the rendered PNG never overflows the layout
 * — title wraps at ~3 lines, code block fits ~28 lines, bullets stay
 * one line each. Claude is told these limits in the prompt; this
 * schema is the second line of defense.
 */
export const GemImageSlotsSchema = z.object({
  /** Project name for the header right-side, e.g. "Bond Form". */
  project: z.string().min(1).max(40),
  /** Big title under the header — the gem's headline rephrased as a
   *  technical claim. NOT the post's hook line. */
  title: z.string().min(1).max(120),
  /** ~6-20 lines of code that visualise the gem's API or pattern.
   *  Should be standalone-readable — no truncated `…` or external
   *  references the reader can't infer. */
  code_snippet: z.string().min(10).max(900),
  /** Language hint for Shiki syntax highlighting. */
  code_language: z.enum([
    "dart",
    "swift",
    "kotlin",
    "typescript",
    "javascript",
    "java",
    "python",
    "objc",
    "rust",
    "go",
  ]),
  /** 3-4 bullet points for the "Why it works" panel. Each one a single
   *  short concrete claim — not a full sentence. */
  bullet_points: z.array(z.string().min(3).max(120)).min(2).max(4),
  /** Optional override for the footer right-side line. Defaults to the
   *  project's tagline. */
  footer_text: z.string().max(80).optional(),
});

export type GemImageSlots = z.infer<typeof GemImageSlotsSchema>;
