/**
 * Carousel route — on-demand PDF carousel generation for an existing
 * content row.
 *
 *   POST   /api/content/:id/carousel        — generate (or regenerate
 *                                             with ?regenerate=true)
 *   GET    /api/content/:id/carousel        — stream the PDF
 *   DELETE /api/content/:id/carousel        — clear artefacts
 *
 * Storage: PDF on disk at `data/carousels/{id}.pdf` (gitignored).
 * Deck JSON + brand id persisted on the `generated_content` row so
 * we can re-render without re-prompting Claude.
 */

import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import {
  getContentWithGem,
  setCarouselArtifacts,
  getCarouselArtifacts,
} from "@/lib/db";
import { initAgents } from "@/agents/bootstrap";
import {
  findRepoContext,
  type ContentAIAgent,
  type GemForRegeneration,
} from "@/agents/ai/content-ai-agent";
import { renderCarousel } from "@/services/carousel-renderer";
import {
  assembleCarouselPdf,
  saveSlidePngs,
} from "@/services/carousel-pdf-service";
import { CarouselDeckSchema } from "@/agents/schemas/carousel-deck.schema";
import { projectNameFromRepo } from "@/lib/carousel-brands";

export const runtime = "nodejs";

function carouselPdfPath(contentId: number): string {
  return path.join(process.cwd(), "data", "carousels", `${contentId}.pdf`);
}

function carouselThumbsDir(): string {
  return path.join(process.cwd(), "data", "carousels");
}

/** Path to the on-disk thumbnail PNG for a given content row + 1-indexed
 *  page. Mirrors the layout produced by `saveSlidePngs`. */
export function carouselThumbPath(contentId: number, page: number): string {
  return path.join(carouselThumbsDir(), `${contentId}-page-${page}.png`);
}

function carouselPdfRoute(contentId: number): string {
  return `/api/content/${contentId}/carousel`;
}

/** Pull GemForRegeneration shape out of the gem row's `ai_analysis`
 *  blob if present; falls back to bare row fields. Mirrors the
 *  decoder in `/api/content/[id]/route.ts`. */
function decodeGemContext(
  gem: { ai_analysis?: string | null; repo_name?: string | null } | null
): {
  gemTitle?: string;
  realProblem?: string;
  whyInteresting?: string;
  contentAngle?: string;
  repoName?: string;
  codeSnippet?: string;
  usageExample?: string;
} {
  if (!gem) return {};
  const repoName = gem.repo_name ?? undefined;
  if (!gem.ai_analysis) return { repoName };
  try {
    const parsed = JSON.parse(gem.ai_analysis) as GemForRegeneration;
    return {
      gemTitle: parsed.title,
      realProblem: parsed.realProblem,
      whyInteresting: parsed.whyInteresting,
      contentAngle: parsed.contentAngle,
      repoName,
      codeSnippet: parsed.codeSnippet,
      usageExample: parsed.usageExample,
    };
  } catch {
    return { repoName };
  }
}

/**
 * POST — full pipeline: fetch content → call Layla → render slides →
 * assemble PDF → persist. Idempotent on the same content id (writes
 * to the same on-disk path); use `?regenerate=true` to force a fresh
 * Claude call when an existing deck is on the row.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contentId = Number(id);
  if (!Number.isFinite(contentId)) {
    return NextResponse.json({ error: "Invalid content id" }, { status: 400 });
  }

  const url = new URL(request.url);
  const regenerate = url.searchParams.get("regenerate") === "true";

  const row = getContentWithGem(contentId);
  if (!row) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  // Cache hit — return the existing artefacts unless caller asked to
  // regenerate. Saves a Claude call + a render pass.
  if (!regenerate) {
    const existing = getCarouselArtifacts(contentId);
    if (existing?.pdfUrl) {
      return NextResponse.json({
        ok: true,
        cached: true,
        contentId,
        pdfUrl: existing.pdfUrl,
        brandId: existing.brandId,
      });
    }
  }

  const postText = row.content.generated_text || "";
  if (postText.length < 100) {
    return NextResponse.json(
      { error: "Post too short for a carousel (need ≥100 chars)" },
      { status: 422 }
    );
  }

  const ctx = decodeGemContext(row.gem);
  const repoContext = ctx.repoName ? findRepoContext(ctx.repoName) : "";
  // Project name comes from the gem's repo. When the row has no gem
  // (older content / non-gem source) we fall back to a generic author
  // brand so the deck still renders.
  const project = ctx.repoName
    ? projectNameFromRepo(ctx.repoName)
    : "Salah Nahed";

  const agents = initAgents();
  const layla = agents.get("content") as ContentAIAgent | undefined;
  if (!layla) {
    return NextResponse.json(
      { error: "Content (Layla) agent not registered" },
      { status: 500 }
    );
  }

  const start = Date.now();
  let layoutOutput;
  try {
    layoutOutput = await layla.generateCarouselFromContent({
      postText,
      project,
      repoContext,
      gemTitle: ctx.gemTitle,
      realProblem: ctx.realProblem,
      whyInteresting: ctx.whyInteresting,
      contentAngle: ctx.contentAngle,
      codeSnippet: ctx.codeSnippet,
      usageExample: ctx.usageExample,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Layla failed to draft carousel", detail: message },
      { status: 502 }
    );
  }
  const carouselPost = layoutOutput.carouselPost;

  // Defensive re-validation — `generateCarouselFromContent` already
  // ran Zod, but the API boundary owns the contract with renderers.
  const validated = CarouselDeckSchema.parse(layoutOutput.carousel);

  // Carousel only makes sense for code-heavy posts. If Claude didn't
  // emit a code slide (degenerate case), bail loudly so the UI can
  // fall back to the existing single-PNG path.
  const hasCodeSlide = validated.slides.some((s) => s.type === "code");
  if (!hasCodeSlide) {
    return NextResponse.json(
      {
        error: "Generated deck has no code slide — falling back is the caller's job",
        deck: validated,
      },
      { status: 422 }
    );
  }

  let renderResult;
  try {
    renderResult = await renderCarousel(validated);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Slide rendering failed", detail: message },
      { status: 500 }
    );
  }

  const pdfDiskPath = carouselPdfPath(contentId);
  let pdfInfo;
  try {
    pdfInfo = await assembleCarouselPdf(renderResult.slides, pdfDiskPath, {
      title:
        validated.slides.find((s) => s.type === "cover")?.type === "cover"
          ? (validated.slides.find((s) => s.type === "cover") as { title: string }).title
          : `Carousel for content ${contentId}`,
      author: "Salah Nahed",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "PDF assembly failed", detail: message },
      { status: 500 }
    );
  }

  // Save per-slide PNGs alongside the PDF so the UI's thumbnail strip
  // doesn't need to re-render via Satori on every page load. Failure
  // here is non-fatal — the strip route falls back to "regenerate" and
  // the PDF itself is still good.
  try {
    await saveSlidePngs(
      renderResult.slides,
      carouselThumbsDir(),
      String(contentId)
    );
  } catch (err) {
    console.error(
      `[carousel] saveSlidePngs failed for content ${contentId}:`,
      err
    );
  }

  const pdfUrl = carouselPdfRoute(contentId);
  setCarouselArtifacts(contentId, {
    pdfUrl,
    deckJson: JSON.stringify(validated),
    brandId: renderResult.brand.id,
    postText: carouselPost,
  });

  return NextResponse.json({
    ok: true,
    cached: false,
    contentId,
    pdfUrl,
    brandId: renderResult.brand.id,
    slides: validated.slides.length,
    carouselPostLength: carouselPost.length,
    bytes: pdfInfo.byteLength,
    renderMs: renderResult.durationMs,
    totalMs: Date.now() - start,
  });
}

/**
 * GET — stream the PDF off disk. Returns 404 when no carousel has
 * been generated yet (or the file went missing — call POST again).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contentId = Number(id);
  if (!Number.isFinite(contentId)) {
    return new Response("Invalid content id", { status: 400 });
  }
  const artefacts = getCarouselArtifacts(contentId);
  if (!artefacts?.pdfUrl) {
    return new Response("Carousel not generated", { status: 404 });
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(carouselPdfPath(contentId));
  } catch {
    return new Response("PDF file missing on disk; POST to regenerate", {
      status: 404,
    });
  }
  // Blob wrapper for the body; cast Buffer→BlobPart through unknown
  // to bridge the Node 20 / DOM typings clash (runtime accepts Buffer
  // directly — see preview route for the matching note).
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: "application/pdf",
  });
  return new Response(blob, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `inline; filename="carousel-${contentId}.pdf"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}

/**
 * DELETE — clear all carousel artefacts (DB columns + on-disk PDF).
 * Idempotent: succeeds even when nothing was there.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contentId = Number(id);
  if (!Number.isFinite(contentId)) {
    return NextResponse.json({ error: "Invalid content id" }, { status: 400 });
  }
  setCarouselArtifacts(contentId, {
    pdfUrl: null,
    deckJson: null,
    brandId: null,
  });
  try {
    await unlink(carouselPdfPath(contentId));
  } catch {
    // Already gone — fine.
  }
  return NextResponse.json({ ok: true, contentId });
}

