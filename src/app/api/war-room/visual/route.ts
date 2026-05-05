/**
 * POST /api/war-room/visual
 *
 * On-demand trigger for Ghada's image generation. Used by Yusuf's
 * Visual Preview "Generate visual" / "Regenerate" buttons.
 *
 * Body: `{ contentId: number, regenerate?: boolean }`
 *
 * `regenerate` defaults to false. When the row already has an
 * `image_url` and regenerate is false, we short-circuit and return
 * the existing image — no DALL-E call, no $0.04 spent. With
 * regenerate=true we always re-call DALL-E and overwrite the cached
 * file.
 *
 * Returns `{ ok, contentId, imageUrl?, costUsd?, error? }`. On
 * failure (no API key, DALL-E error, network) returns 502 with the
 * structured error so the UI can surface a useful message.
 */

import { NextRequest, NextResponse } from "next/server";
import { getContentById, getContentImage } from "@/lib/db";
import { initAgents } from "@/agents/bootstrap";
import type { GhadaAIAgent } from "@/agents/ai/ghada-ai-agent";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req
    .json()
    .catch(() => ({} as Record<string, unknown>))) as {
    contentId?: number | string;
    regenerate?: boolean;
    /** "blueprint" (default) → Sonnet → SVG, ~$0.005/image, crisp labels.
     *  "spider-verse" → DALL-E 3 → PNG, ~$0.04/image, comic-book aesthetic. */
    style?: "blueprint" | "spider-verse";
    /** When set, bypasses the Haiku visual-brief summariser and uses
     *  this string directly as the prompt anchor. Used by Ghada's
     *  chat-driven edit flow so Salah's typed "make it a sequence
     *  diagram with the focal node in amber" lands verbatim. */
    briefOverride?: string;
  };
  const contentId = Number(body.contentId);
  const regenerate = !!body.regenerate;
  const style: "blueprint" | "spider-verse" =
    body.style === "spider-verse" ? "spider-verse" : "blueprint";
  const briefOverride =
    typeof body.briefOverride === "string" && body.briefOverride.trim()
      ? body.briefOverride.trim()
      : undefined;

  if (!Number.isFinite(contentId) || contentId <= 0) {
    return NextResponse.json({ error: "Invalid contentId" }, { status: 400 });
  }

  const row = getContentById(contentId);
  if (!row) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  // Short-circuit when an image already exists and we're not being
  // asked to regenerate — saves $0.04 + a few seconds of round-trip.
  const existing = getContentImage(contentId);
  if (existing.imageUrl && !regenerate) {
    return NextResponse.json({
      ok: true,
      contentId,
      imageUrl: existing.imageUrl,
      cached: true,
    });
  }

  // Fire Ghada. The bootstrap returns a Map keyed on agent ids; we
  // grab her instance and call generateForContent directly (rather
  // than going through the bus) so we can return the result inline.
  const agents = initAgents();
  const ghada = agents.get("ghada") as GhadaAIAgent | undefined;
  if (!ghada) {
    return NextResponse.json(
      { error: "Ghada agent not registered" },
      { status: 500 }
    );
  }

  const result =
    style === "spider-verse"
      ? await ghada.generateSpiderVerseForContent(
          contentId,
          row.generated_text || "",
          briefOverride
        )
      : await ghada.generateForContent(
          contentId,
          row.generated_text || "",
          briefOverride
        );

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        contentId,
        error: result.error,
        costUsd: result.costUsd ?? 0,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    contentId,
    style,
    imageUrl: result.imageUrl,
    imagePrompt: result.imagePrompt,
    costUsd: result.costUsd,
  });
}
