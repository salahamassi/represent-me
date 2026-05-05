/**
 * POST /api/content/mine
 *
 * Targeted on-demand gem-mining trigger. Bypasses the random
 * 2-of-3 shuffle in the Monday cron and lets us aim Layla at a
 * specific repo or monorepo subpackage (e.g. flutterbond/bond-core
 * scoped to packages/form).
 *
 * Body:
 *   {
 *     owner:    string,
 *     repo:     string,
 *     branch?:  string,           // defaults to "main"
 *     path?:    string,           // monorepo subpath, e.g. "packages/form"
 *     context?: string,           // business-context blurb for Claude
 *   }
 *
 * Response:
 *   {
 *     ok: true,
 *     target: string,
 *     gemCount: number,
 *     gems: [{ gemId, contentId, title, suggestedPlatform, postPreview }, ...],
 *     totalCostUsd: number,       // best-effort — only what's directly billed in this route
 *     durationMs: number,
 *   }
 *
 * Side effects: writes to `code_gems` (one row per gem), to
 * `generated_content` (one row per gem with a drafted LinkedIn post),
 * and publishes `content:linkedin-post-created` so Ghada auto-fires
 * her SVG generator in the background. Telegram preview is NOT sent
 * by this route (the cron path sends those — manual on-demand
 * triggers shouldn't spam).
 */

import fs from "node:fs/promises";
import nodePath from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { initAgents } from "@/agents/bootstrap";
import { getAgentBus } from "@/agents/base/agent-bus";
import {
  insertCodeGem,
  updateCodeGemContent,
  insertGeneratedContent,
  setContentImage,
} from "@/lib/db";
import type { CodeGemsAnalysis } from "@/agents/schemas/code-gems.schema";
import type { ContentAIAgent } from "@/agents/ai/content-ai-agent";
import { renderInfographic } from "@/services/infographic-renderer";
import {
  autoGenerateCarousel,
  type AutoCarouselResult,
} from "@/services/auto-carousel";

export const runtime = "nodejs";

const INFOGRAPHIC_DIR = nodePath.join(process.cwd(), "public", "infographics");

export async function POST(req: NextRequest) {
  const start = Date.now();

  let body: {
    owner?: unknown;
    repo?: unknown;
    branch?: unknown;
    path?: unknown;
    context?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.owner !== "string" || !body.owner) {
    return NextResponse.json({ error: "owner required" }, { status: 400 });
  }
  if (typeof body.repo !== "string" || !body.repo) {
    return NextResponse.json({ error: "repo required" }, { status: 400 });
  }
  const owner = body.owner;
  const repo = body.repo;
  const branch = typeof body.branch === "string" && body.branch ? body.branch : "main";
  const path = typeof body.path === "string" && body.path ? body.path : undefined;
  const context = typeof body.context === "string" ? body.context : "";
  const targetLabel = path ? `${owner}/${repo}:${path}` : `${owner}/${repo}`;

  // Bootstrap agents — same pattern the existing visual route uses.
  // Returns a Map keyed on agent ids.
  const agents = initAgents();
  const layla = agents.get("content") as ContentAIAgent | undefined;
  if (!layla) {
    return NextResponse.json(
      { error: "Content (Layla) agent not registered" },
      { status: 500 }
    );
  }
  const bus = getAgentBus();

  // 1. Fire the bus → GitHub agent does the analysis with the path
  //    filter. 90s timeout matches the cron path.
  let analysis: CodeGemsAnalysis;
  try {
    analysis = await bus.request<CodeGemsAnalysis>(
      "github:analyze-repo",
      { owner, repo, branch, context, path },
      90_000
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        target: targetLabel,
        error: `github:analyze-repo failed: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - start,
      },
      { status: 502 }
    );
  }

  if (!analysis.gems || analysis.gems.length === 0) {
    return NextResponse.json({
      ok: true,
      target: targetLabel,
      gemCount: 0,
      gems: [],
      note: "No gems found — try a different package or broader path.",
      durationMs: Date.now() - start,
    });
  }

  // Ensure the output dir exists once per request — race-safe.
  try {
    await fs.mkdir(INFOGRAPHIC_DIR, { recursive: true });
  } catch {
    // Concurrent mkdir is fine; the recursive flag swallows EEXIST.
  }

  // 2. For each gem: persist + draft kit (post + image slots) + render
  // PNG + persist path. Sequential (not parallel) so we don't hammer
  // Claude with N concurrent calls — keeps cost predictable.
  //
  // We DELIBERATELY do not fire `content:linkedin-post-created` here
  // (which would auto-trigger Ghada's SVG path). For Salah-Formula
  // gems the BondInfographic PNG is THE visual; the Ghada SVG would
  // be a redundant second image competing for the `image_url` slot.
  // Non-gem flows (e.g. shipped-PR posts) still use Ghada.
  const out: Array<{
    gemId: number;
    contentId: number | null;
    title: string;
    suggestedPlatform: string;
    postPreview: string | null;
    infographicUrl: string | null;
    renderMs?: number;
    error?: string;
    /** Diagnostic — captures why the imageSlots retry pass failed
     *  when the primary call dropped imageSlots AND the retry threw.
     *  Null infographicUrl + this message = retry-specific failure. */
    retryError?: string;
    /** Phase 5 — carousel auto-trigger result envelope. Null when the
     *  gem skipped carousel generation altogether (e.g. non-LinkedIn
     *  platform); populated otherwise so the manual caller can see
     *  whether the deck landed and how long it took. */
    carousel?: AutoCarouselResult;
  }> = [];

  for (const gem of analysis.gems) {
    const gemId = insertCodeGem({
      repoName: gem.repoName,
      filePath: gem.filePath,
      gemType: gem.gemType,
      title: gem.title,
      description: gem.description,
      codeSnippet: gem.codeSnippet,
      aiAnalysis: JSON.stringify(gem),
    });

    if (!gem.suggestedPlatform) {
      out.push({
        gemId,
        contentId: null,
        title: gem.title,
        suggestedPlatform: "(none)",
        postPreview: null,
        infographicUrl: null,
      });
      continue;
    }

    try {
      // 2a. Draft the kit — post text + structured image slots in one
      // Claude call so the slots are anchored on the same reasoning
      // pass that produced the prose. `retryError` is non-null when
      // the primary call dropped imageSlots AND the retry pass also
      // failed — surfaced in the response below for diagnostics.
      const { postText, imageSlots, retryError } = await layla.generateGemKit(gem, context);
      const contentId = insertGeneratedContent(
        `gem_${gem.suggestedPlatform}_post`,
        postText,
        `gem-${gemId}`
      );
      updateCodeGemContent(gemId, contentId);

      // 2b. Render the infographic PNG via Satori. Only for LinkedIn
      // gems with image slots — Medium / Dev.to don't use this format.
      let infographicUrl: string | null = null;
      let renderMs: number | undefined;
      if (gem.suggestedPlatform === "linkedin" && imageSlots) {
        try {
          const { png, durationMs } = await renderInfographic(imageSlots);
          renderMs = durationMs;
          const localPath = nodePath.join(INFOGRAPHIC_DIR, `${contentId}.png`);
          await fs.writeFile(localPath, png);
          infographicUrl = `/infographics/${contentId}.png`;
          // Persist on the same content row so the review UI surfaces
          // the PNG via the existing image_url column.
          setContentImage(contentId, infographicUrl, imageSlots.title);
        } catch (renderErr) {
          // Renderer failure shouldn't kill the gem — the post is
          // still useful without the image. Log + continue.
          console.error(`[mine] infographic render failed for gem ${gemId}:`, renderErr);
        }
      }

      // 2c. Auto-carousel — Phase 5 default-on. Layla drafts a
      //     4-slide deck from the post + gem context, renders to PDF,
      //     and persists. Non-fatal: a failure here doesn't block the
      //     gem's other artefacts. Set CAROUSEL_DISABLED=true in env
      //     to suppress globally.
      const carousel = await autoGenerateCarousel(layla, {
        contentId,
        gem,
        postText,
        repoContext: context || undefined,
      });
      if (!carousel.ok && !carousel.skipped) {
        console.error(
          `[mine] auto-carousel failed for gem ${gemId} (content ${contentId}): ${carousel.error}`
        );
      }

      out.push({
        gemId,
        contentId,
        title: gem.title,
        suggestedPlatform: gem.suggestedPlatform,
        postPreview: postText.slice(0, 280),
        infographicUrl,
        renderMs,
        // Diagnostic: if the imageSlots retry pass failed, the message
        // surfaces here so we can see WHY the infographic was skipped
        // instead of guessing from a null infographicUrl.
        retryError: retryError ?? undefined,
        carousel,
      });
    } catch (err) {
      out.push({
        gemId,
        contentId: null,
        title: gem.title,
        suggestedPlatform: gem.suggestedPlatform,
        postPreview: null,
        infographicUrl: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    target: targetLabel,
    gemCount: out.length,
    gems: out,
    durationMs: Date.now() - start,
  });
}
