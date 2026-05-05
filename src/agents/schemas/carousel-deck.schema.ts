import { z } from "zod/v4";

/**
 * Multi-slide LinkedIn carousel deck. Layla emits this alongside the
 * narrative post body for code-heavy gems — the reader gets the story
 * in the post, the implementation in a swipeable PDF.
 *
 * Slide-count target is 4 (cover / code / why / outro). 3-6 is the
 * accepted range. The renderer tolerates any order but the
 * conventional shape Layla should produce is:
 *
 *   1. cover    — title + project + author hook
 *   2. code     — Shiki-tokenised snippet, 6-22 lines
 *   3. why      — 2-4 short bullets explaining the design choice
 *   4. outro    — closing hook + CTA / question
 *
 * Lengths are tight bounds so each slide's layout never overflows.
 * Claude is told the limits in the prompt; this schema is the second
 * line of defense.
 */

const CoverSlideSchema = z.object({
  type: z.literal("cover"),
  /** Big title — the gem's headline rephrased as a technical claim. */
  title: z.string().min(4).max(120),
  /** Optional 1-line lead under the title. */
  subtitle: z.string().max(140).optional(),
});

const CodeSlideSchema = z.object({
  type: z.literal("code"),
  /** Optional 1-line caption above the code. */
  caption: z.string().max(140).optional(),
  /** 6-22 lines of standalone-readable code — no truncated `…`. */
  code: z.string().min(20).max(900),
  /** Language hint for Shiki syntax highlighting. Mirrors the set
   *  used by `GemImageSlotsSchema` so both renderers share a vocabulary. */
  language: z.enum([
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
  /** Optional filename shown in the mac-window chrome — e.g.
   *  "auth_service.dart". */
  filename: z.string().max(60).optional(),
});

const WhySlideSchema = z.object({
  type: z.literal("why"),
  /** Panel heading — defaults to "Why it works" if omitted. */
  heading: z.string().max(60).optional(),
  /** 2-4 short concrete claims, one line each. */
  bullets: z.array(z.string().min(3).max(120)).min(2).max(4),
});

const OutroSlideSchema = z.object({
  type: z.literal("outro"),
  /** Closing hook — the principle the reader should remember. */
  hook: z.string().max(180),
  /** CTA — e.g. "Follow for more Flutter case studies". */
  cta: z.string().max(120),
  /** Optional open question to invite replies. */
  question: z.string().max(220).optional(),
});

const CarouselSlideSchema = z.discriminatedUnion("type", [
  CoverSlideSchema,
  CodeSlideSchema,
  WhySlideSchema,
  OutroSlideSchema,
]);

export const CarouselDeckSchema = z.object({
  /** Display name for the project — matches `GemImageSlots.project`.
   *  Drives brand resolution via substring match (case-insensitive)
   *  in `src/lib/carousel-brands.ts`. */
  project: z.string().min(1).max(40),
  /** Optional override for the author footer's tagline. */
  footerText: z.string().max(80).optional(),
  /** Ordered slides. Conventional shape: cover → code → why → outro. */
  slides: z.array(CarouselSlideSchema).min(3).max(6),
});

export type CarouselDeck = z.infer<typeof CarouselDeckSchema>;
export type CoverSlide = z.infer<typeof CoverSlideSchema>;
export type CodeSlide = z.infer<typeof CodeSlideSchema>;
export type WhySlide = z.infer<typeof WhySlideSchema>;
export type OutroSlide = z.infer<typeof OutroSlideSchema>;
export type CarouselSlide = z.infer<typeof CarouselSlideSchema>;
