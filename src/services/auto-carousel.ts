/**
 * Auto-carousel trigger — shared by the manual `/api/content/mine`
 * route and the cron-driven gem mining inside ContentAIAgent.
 *
 * Default behaviour: ENABLED. Set `CAROUSEL_DISABLED=true` in the env
 * to suppress the auto-trigger globally (useful for cost emergencies
 * or while iterating on the prompt).
 *
 * Side effects on success:
 *   - Renders 4 PNG slides + 1 PDF to `data/carousels/`.
 *   - Persists `carousel_pdf_url` / `carousel_deck_json` /
 *     `carousel_brand_id` on the matching `generated_content` row.
 *
 * Failure is non-fatal — callers log the error and continue with the
 * gem's other artefacts (the post + the single-PNG infographic).
 */

import path from "node:path";
import { setCarouselArtifacts } from "@/lib/db";
import {
  projectNameFromRepo,
} from "@/lib/carousel-brands";
import type { ContentAIAgent } from "@/agents/ai/content-ai-agent";
import type { GemForRegeneration } from "@/agents/ai/content-ai-agent";
import { renderCarousel } from "@/services/carousel-renderer";
import {
  assembleCarouselPdf,
  saveSlidePngs,
} from "@/services/carousel-pdf-service";
import { CarouselDeckSchema } from "@/agents/schemas/carousel-deck.schema";

const CAROUSEL_DIR = path.join(process.cwd(), "data", "carousels");

function carouselDisabled(): boolean {
  // Explicit `true` only — anything else (unset, "false", "0") leaves
  // the auto-trigger on. Keeps the default-ON contract safe.
  return process.env.CAROUSEL_DISABLED === "true";
}

/**
 * Should we generate a carousel for this gem? Skip if it's not a
 * LinkedIn-targeted gem, or if the gem has no source code (carousels
 * always have a code slide; without code Layla would either fabricate
 * one or the schema would reject the deck).
 */
function shouldRunCarousel(gem: GemForRegeneration): {
  run: boolean;
  reason?: "not-linkedin" | "no-code";
} {
  if (gem.suggestedPlatform !== "linkedin") {
    return { run: false, reason: "not-linkedin" };
  }
  if (!gem.codeSnippet || !gem.codeSnippet.trim()) {
    return { run: false, reason: "no-code" };
  }
  return { run: true };
}

export interface AutoCarouselResult {
  ok: boolean;
  /** Set to a token when we deliberately skipped (vs failed). */
  skipped?: "disabled" | "not-linkedin" | "no-code";
  /** Route path the UI/API uses to GET the PDF
   *  (`/api/content/:id/carousel`). Persisted on the row. */
  pdfUrl?: string;
  /** Absolute on-disk path to the PDF. Exposed so callers (e.g.
   *  Telegram preview, archival) don't have to know the storage
   *  layout. */
  pdfPath?: string;
  brandId?: string;
  slides?: number;
  /** Phase 7 — narrative-only post body Layla rewrote alongside the
   *  carousel deck. Persisted on `carousel_post_text` and preferred
   *  by the publish + Telegram flows when present. */
  carouselPost?: string;
  /** End-to-end ms when `ok: true` or when we got far enough to time. */
  durationMs?: number;
  /** Set on `ok: false` (and not `skipped`). Layla / Renderer / PDF
   *  errors all bubble through here as a string. */
  error?: string;
}

/**
 * Generate + render + persist a carousel for a freshly-drafted gem
 * post. Caller has already inserted the `generated_content` row and
 * has the `gem` + `postText` + `repoContext` in hand from
 * `generateGemKit`.
 *
 * Returns a result envelope rather than throwing — the carousel is
 * an enhancement, not part of the gem's critical path. Caller
 * surfaces the result in its own response payload (manual route) or
 * just logs (cron).
 */
export async function autoGenerateCarousel(
  layla: ContentAIAgent,
  args: {
    contentId: number;
    gem: GemForRegeneration;
    postText: string;
    repoContext?: string;
  }
): Promise<AutoCarouselResult> {
  if (carouselDisabled()) {
    return { ok: false, skipped: "disabled" };
  }

  const gate = shouldRunCarousel(args.gem);
  if (!gate.run) {
    return { ok: false, skipped: gate.reason };
  }

  const start = Date.now();
  try {
    const project = projectNameFromRepo(args.gem.repoName);

    const layoutOutput = await layla.generateCarouselFromContent({
      postText: args.postText,
      project,
      repoContext: args.repoContext,
      gemTitle: args.gem.title,
      realProblem: args.gem.realProblem,
      whyInteresting: args.gem.whyInteresting,
      contentAngle: args.gem.contentAngle,
      codeSnippet: args.gem.codeSnippet,
      usageExample: args.gem.usageExample,
    });
    const carouselPost = layoutOutput.carouselPost;

    // Re-validate at the boundary — Layla already ran Zod, but the
    // renderer / PDF assembler trust this contract so a defensive
    // pass keeps the failure mode loud and local.
    const validated = CarouselDeckSchema.parse(layoutOutput.carousel);

    const renderResult = await renderCarousel(validated);

    const pdfPath = path.join(CAROUSEL_DIR, `${args.contentId}.pdf`);
    const coverSlide = validated.slides.find((s) => s.type === "cover");
    await assembleCarouselPdf(renderResult.slides, pdfPath, {
      title:
        coverSlide?.type === "cover"
          ? coverSlide.title
          : `Carousel for content ${args.contentId}`,
      author: "Salah Nahed",
    });

    // Per-slide PNGs for the UI thumbnail strip. Non-fatal on failure
    // — the PDF itself is still good and the strip route falls back
    // to a 404 (UI handles by hiding the strip, not by crashing).
    try {
      await saveSlidePngs(
        renderResult.slides,
        CAROUSEL_DIR,
        String(args.contentId)
      );
    } catch (err) {
      console.error(
        `[auto-carousel] saveSlidePngs failed for content ${args.contentId}:`,
        err
      );
    }

    const pdfUrl = `/api/content/${args.contentId}/carousel`;
    setCarouselArtifacts(args.contentId, {
      pdfUrl,
      deckJson: JSON.stringify(validated),
      brandId: renderResult.brand.id,
      postText: carouselPost,
    });

    return {
      ok: true,
      pdfUrl,
      pdfPath,
      brandId: renderResult.brand.id,
      slides: validated.slides.length,
      carouselPost,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}
