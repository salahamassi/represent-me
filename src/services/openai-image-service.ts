/**
 * OpenAI image generation service. Thin wrapper around the DALL-E 3
 * `/v1/images/generations` endpoint. Exists as a discrete service (not
 * inlined in Ghada) so the cost-tracking, retry, and disk-persistence
 * concerns stay testable in isolation.
 *
 * Defaults are tuned for Ghada's Spider-Verse path:
 *   - dall-e-3, 1024x1024, standard quality → $0.04 per image
 *   - response_format: b64_json so we get the bytes immediately and
 *     can persist them to /public/wr-visuals — DALL-E URLs expire
 *     after one hour, which would silently break old image_urls.
 *
 * No DB writes here. Callers (Ghada) own the persistence + activity
 * logging so the service stays a pure boundary adapter.
 */

import fs from "node:fs";
import path from "node:path";

const OPENAI_IMAGE_ENDPOINT = "https://api.openai.com/v1/images/generations";

/** Pricing reference per OpenAI's published rate card (2026-04). When
 *  you change `model` or `size`/`quality`, update this table too. */
const DALLE3_PRICING_USD: Record<string, number> = {
  "1024x1024:standard": 0.04,
  "1024x1024:hd": 0.08,
  "1024x1792:standard": 0.08,
  "1792x1024:standard": 0.08,
  "1024x1792:hd": 0.12,
  "1792x1024:hd": 0.12,
};

export interface OpenAIImageRequest {
  prompt: string;
  /** OpenAI silently rewrites prompts unless you explicitly ask it not
   *  to via this prefix. We want our Spider-Verse aesthetic to come
   *  through verbatim, so callers can opt in. */
  model?: "dall-e-3";
  size?: "1024x1024" | "1024x1792" | "1792x1024";
  quality?: "standard" | "hd";
}

export interface OpenAIImageResult {
  ok: true;
  /** Public URL after we've saved the PNG to /public/wr-visuals. */
  imageUrl: string;
  /** Local filesystem path of the saved file. */
  localPath: string;
  /** Whatever prompt OpenAI's policy filter ended up using (may differ
   *  from what we sent — they sometimes inject safety preambles). */
  revisedPrompt: string | null;
  /** Per the pricing table above. Logged via Ghada's `logAIUsage`. */
  costUsd: number;
  /** End-to-end wall time in ms. */
  durationMs: number;
}

export interface OpenAIImageError {
  ok: false;
  error: string;
  /** Cost is 0 on hard failure — OpenAI doesn't bill for 4xx/5xx. */
  costUsd: 0;
  durationMs: number;
}

/**
 * Generate one image and persist it to /public/wr-visuals/{filenameStem}.png.
 *
 * `filenameStem` is typically the contentId so the saved path collides
 * with the same row's prior image (overwriting on regenerate is the
 * desired behaviour — we don't want to leak stale files on disk).
 */
export async function generateImage(
  filenameStem: string | number,
  req: OpenAIImageRequest
): Promise<OpenAIImageResult | OpenAIImageError> {
  const start = Date.now();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "OPENAI_API_KEY is not set",
      costUsd: 0,
      durationMs: Date.now() - start,
    };
  }

  const model = req.model || "dall-e-3";
  const size = req.size || "1024x1024";
  const quality = req.quality || "standard";

  let resp: Response;
  try {
    resp = await fetch(OPENAI_IMAGE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt: req.prompt,
        n: 1,
        size,
        quality,
        response_format: "b64_json",
      }),
    });
  } catch (err) {
    return {
      ok: false,
      error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
      costUsd: 0,
      durationMs: Date.now() - start,
    };
  }

  if (!resp.ok) {
    let detail = "";
    try {
      const errBody = (await resp.json()) as { error?: { message?: string } };
      detail = errBody?.error?.message || (await resp.text());
    } catch {
      detail = `HTTP ${resp.status}`;
    }
    return {
      ok: false,
      error: `OpenAI ${resp.status}: ${detail.slice(0, 300)}`,
      costUsd: 0,
      durationMs: Date.now() - start,
    };
  }

  const data = (await resp.json()) as {
    data?: Array<{ b64_json?: string; revised_prompt?: string }>;
  };
  const first = data.data?.[0];
  const b64 = first?.b64_json;
  if (!b64) {
    return {
      ok: false,
      error: "OpenAI returned no image data",
      costUsd: 0,
      durationMs: Date.now() - start,
    };
  }

  // Persist to /public/wr-visuals/{stem}.png. Mirror the directory layout
  // Ghada's SVG path uses so a single static-serve route handles both.
  const visualDir = path.join(process.cwd(), "public", "wr-visuals");
  try {
    fs.mkdirSync(visualDir, { recursive: true });
  } catch {
    // Race-safe — concurrent generations can both try to mkdir.
  }
  const localPath = path.join(visualDir, `${filenameStem}.png`);
  try {
    fs.writeFileSync(localPath, Buffer.from(b64, "base64"));
  } catch (err) {
    return {
      ok: false,
      error: `Disk write failed: ${err instanceof Error ? err.message : String(err)}`,
      costUsd: 0,
      durationMs: Date.now() - start,
    };
  }

  const costUsd = DALLE3_PRICING_USD[`${size}:${quality}`] ?? 0.04;

  return {
    ok: true,
    imageUrl: `/wr-visuals/${filenameStem}.png`,
    localPath,
    revisedPrompt: first.revised_prompt || null,
    costUsd,
    durationMs: Date.now() - start,
  };
}

/**
 * Build a stylized comic-panel prompt from a one-sentence brief. We
 * deliberately AVOID naming any IP ("Spider-Verse" was the original
 * inspiration for the aesthetic, but using that word made DALL-E
 * draw the actual character). The visual we want is pure style —
 * halftone Ben-Day dots, bold ink, duotone palette — applied to an
 * ABSTRACT METAPHOR for the technical concept, not a literal scene
 * with people.
 *
 * The negative constraint list is enumerated explicitly because
 * DALL-E weighs "do not draw X, Y, Z" much better than soft phrases
 * like "no text" alone. The "people / faces / hands / characters /
 * speech bubbles" bans are what stop it from inventing a person
 * holding a sign with garbled letters.
 */
export function buildSpiderVersePrompt(brief: string): string {
  const cleanBrief = brief.replace(/\s+/g, " ").trim().slice(0, 400);
  return [
    `A stylized comic-book panel illustration depicting the following technical concept as an abstract architectural or mechanical metaphor (NOT as a literal scene, NOT featuring people): ${cleanBrief}`,
    `Visual treatment: bold black ink outlines, halftone Ben-Day dot shading, vibrant magenta + cyan + black duotone palette, dynamic motion lines, hard cell-shading, strong dramatic perspective, comic panel composition.`,
    `Imagery: glowing pipes, interlocking gears, neon city rooftops, circuit-board architecture, abstract geometric flows, layered depth.`,
    `STRICT — the image must contain NONE of the following: people, human figures, characters, superheroes, faces, hands, body parts, text, letters, numbers, labels, captions, speech bubbles, thought bubbles, logos, brand names, signs, watermarks, signatures.`,
  ].join(" ");
}
