import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getContentById, markContentPublished, markContentScheduled } from "@/lib/db";
import {
  isInPostingWindow,
  nextPostingSlot,
  formatAstLocal,
  POSTING_TIMEZONE,
} from "@/lib/posting-schedule";
import { publishCarousel } from "./linkedin-document-publisher";

/**
 * Zernio — unified social API used to auto-post approved content to LinkedIn.
 *
 * Flow for a LinkedIn post with an image attachment:
 *   1. getLinkedInAccountId()    — looks up the user's connected LinkedIn accountId
 *   2. resolveMediaBytes()       — local file under /public OR the code-card route fetched via localhost
 *   3. uploadMediaToZernio()     — POST /media → PUT presigned R2 URL → publicUrl
 *   4. POST /posts               — content + platforms + media + publishNow:true
 *
 * The upload step (step 3) means the post never depends on APP_BASE_URL
 * being publicly reachable — Zernio's R2 store hosts the image instead.
 *
 * The service is fail-closed by design: if any step errors (or the API key is
 * missing), publishToLinkedIn returns `{ok:false, error}` rather than throwing.
 * The scheduler uses that result to decide whether to mark the row `published`
 * or fall back to the manual paste flow via Telegram.
 */

const API_BASE = process.env.ZERNIO_API_BASE || "https://zernio.com/api/v1";
const API_KEY = process.env.ZERNIO_API_KEY || "";

interface ZernioAccount {
  _id: string;
  platform: string;
  displayName?: string;
  isActive?: boolean;
  enabled?: boolean;
  profileUrl?: string;
}

/**
 * Cache the LinkedIn account id for the lifetime of the process. It never
 * changes unless the user re-connects their account, and /accounts is a
 * network round-trip we don't want on every post.
 */
let cachedLinkedInAccountId: string | null = null;

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${API_KEY}`,
    ...(extra || {}),
  };
}

export function isZernioConfigured(): boolean {
  return !!API_KEY;
}

/**
 * Upload an image buffer to Zernio's R2-backed media store. Two-step flow:
 *
 *   1. POST /media with {filename, contentType, size} → returns
 *      {uploadUrl, publicUrl}. The uploadUrl is a 1-hour presigned
 *      Cloudflare R2 PUT URL.
 *   2. PUT bytes to uploadUrl → file becomes live at publicUrl
 *      (https://media.zernio.com/temp/...).
 *
 * The "temp/" path likely has a server-side TTL (Zernio's docs aren't
 * explicit). Posts published immediately are safe; if a long-scheduled
 * post breaks because the image expired, switch to uploading at
 * publish-fire time instead of at schedule-create time.
 *
 * Returns null on any failure (network, bad status, missing config) so
 * callers can fall back to a text-only post.
 */
async function uploadMediaToZernio(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string | null> {
  if (!isZernioConfigured()) return null;

  // Step 1 — get presigned upload URL + the eventual public URL.
  const initRes = await fetch(`${API_BASE}/media`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ filename, contentType, size: buffer.length }),
  });
  if (!initRes.ok) {
    console.error(
      `[zernio] /media init failed: ${initRes.status} ${await initRes.text().catch(() => "")}`
    );
    return null;
  }
  const init = (await initRes.json()) as {
    uploadUrl?: string;
    publicUrl?: string;
  };
  if (!init.uploadUrl || !init.publicUrl) {
    console.error("[zernio] /media response missing uploadUrl or publicUrl");
    return null;
  }

  // Step 2 — PUT the bytes directly to R2. The presigned URL has all
  // the AWS-style signing baked into its query string.
  const putRes = await fetch(init.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: buffer as unknown as BodyInit,
  });
  if (!putRes.ok) {
    console.error(
      `[zernio] R2 upload failed: ${putRes.status} ${await putRes.text().catch(() => "")}`
    );
    return null;
  }

  return init.publicUrl;
}

/**
 * Resolve the image bytes we want to attach to a content row. Tries — in order:
 *
 *   1. Local file at `public${image_url}` (BondInfographic at
 *      `/infographics/{id}.png` or Ghada Spider-Verse at `/wr-visuals/{id}.png`).
 *   2. The on-demand `/api/content/code-card/{id}` route fetched over
 *      localhost — works because the worker process is on the same box
 *      as the Next dev/prod server.
 *
 * Returns null when no bytes can be sourced (worker on a different
 * host, code-card route disabled, file missing). The caller falls back
 * to a text-only post.
 */
async function resolveMediaBytes(
  contentId: number,
  imagePath: string | null | undefined
): Promise<{ buffer: Buffer; filename: string; contentType: string } | null> {
  // 1. Local file from disk.
  if (imagePath && /\.(png|jpe?g|webp)$/i.test(imagePath)) {
    const localPath = path.join(
      process.cwd(),
      "public",
      imagePath.replace(/^\//, "")
    );
    if (fs.existsSync(localPath)) {
      const ext = path.extname(localPath).slice(1).toLowerCase();
      const contentType =
        ext === "png"
          ? "image/png"
          : ext === "webp"
            ? "image/webp"
            : "image/jpeg";
      return {
        buffer: fs.readFileSync(localPath),
        filename: path.basename(localPath),
        contentType,
      };
    }
  }

  // 2. Fall back to the code-card route, fetched from localhost.
  try {
    const port = process.env.PORT || "3000";
    const cardRes = await fetch(
      `http://localhost:${port}/api/content/code-card/${contentId}`
    );
    if (cardRes.ok) {
      const buf = Buffer.from(await cardRes.arrayBuffer());
      return {
        buffer: buf,
        filename: `content-${contentId}.png`,
        contentType: "image/png",
      };
    }
  } catch {
    // localhost unreachable — worker likely on a different host.
  }
  return null;
}

async function getLinkedInAccountId(force = false): Promise<string | null> {
  if (!isZernioConfigured()) return null;
  if (!force && cachedLinkedInAccountId) return cachedLinkedInAccountId;

  const res = await fetch(`${API_BASE}/accounts`, { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`Zernio /accounts failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { accounts?: ZernioAccount[] };
  const linkedin = (data.accounts || []).find(
    (a) =>
      a.platform === "linkedin" &&
      a.isActive !== false &&
      a.enabled !== false
  );
  cachedLinkedInAccountId = linkedin?._id || null;
  return cachedLinkedInAccountId;
}

export interface PublishResult {
  ok: boolean;
  /** Present only for immediate posts — Zernio doesn't return a URL for scheduled ones. */
  url?: string;
  /** Present only when the post was queued for later; ISO UTC timestamp. */
  scheduledAt?: string;
  error?: string;
}

/**
 * Publish `text` (with an optional publicly-reachable image URL) to the
 * user's LinkedIn account via Zernio. Pass `scheduledFor` (UTC Date) to
 * queue the post for later; otherwise the post goes live immediately.
 *
 * NOTE on `imageUrl`: Zernio's servers fetch the image over the public
 * internet, so the URL must be reachable from outside your dev machine.
 * Localhost URLs will silently result in a text-only post (Zernio drops
 * unreachable media). Use ngrok or deploy to prod for real image support.
 *
 * Never throws; returns {ok:false, error} on any failure so callers can
 * fall back to a manual paste flow.
 */
export async function publishToLinkedIn(args: {
  text: string;
  imageUrl?: string;
  scheduledFor?: Date;
}): Promise<PublishResult> {
  if (!isZernioConfigured()) {
    return { ok: false, error: "ZERNIO_API_KEY is not set" };
  }

  try {
    const accountId = await getLinkedInAccountId();
    if (!accountId) {
      return {
        ok: false,
        error: "No active LinkedIn account connected in Zernio",
      };
    }

    // Zernio's actual payload field is `mediaItems` (the docs' "media" is
    // wrong) and each entry needs a `type` tag alongside the URL.
    const payload: Record<string, unknown> = {
      content: args.text,
      platforms: [{ platform: "linkedin", accountId }],
    };
    if (args.imageUrl) {
      payload.mediaItems = [{ type: "image", url: args.imageUrl }];
    }
    if (args.scheduledFor) {
      // Zernio wants naive local time + a timezone field, not an ISO-UTC Z string.
      payload.scheduledFor = formatAstLocal(args.scheduledFor);
      payload.timezone = POSTING_TIMEZONE;
    } else {
      payload.publishNow = true;
    }

    const postRes = await fetch(`${API_BASE}/posts`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (!postRes.ok) {
      return {
        ok: false,
        error: `Zernio /posts failed: ${postRes.status} ${await postRes.text()}`,
      };
    }

    // Scheduled posts succeed without a platformPostUrl — don't try to read one.
    if (args.scheduledFor) {
      return { ok: true, scheduledAt: args.scheduledFor.toISOString() };
    }

    const data = (await postRes.json()) as {
      platformPostUrl?: string;
      platformResults?: Array<{
        platform: string;
        postUrl?: string;
        platformPostUrl?: string;
      }>;
    };

    // The response shape isn't fully documented; accept a few plausible places
    // the LinkedIn URL could land so we don't miss it on a minor shape change.
    const linkedinResult = data.platformResults?.find(
      (r) => r.platform === "linkedin"
    );
    const url =
      data.platformPostUrl ||
      linkedinResult?.postUrl ||
      linkedinResult?.platformPostUrl;

    return { ok: true, url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Publish a generated_content row to LinkedIn via Zernio. `mode` decides:
 *   - "auto" (default): if we're currently inside the target LinkedIn posting
 *     window (Tue/Wed/Thu 9:30–11:30 AM AST) publish immediately; otherwise
 *     schedule the post for the next 10:30 AM AST slot on a Tue/Wed/Thu.
 *   - "now": always publish immediately, ignoring the window (user override
 *     for moment-sensitive posts).
 *
 * On success the row is flipped to either `published` (with URL) or
 * `scheduled` (with scheduled_for timestamp) so the UI renders the right
 * badge. Never throws — failures return {ok:false, error} for fallback.
 */
export async function publishContentRow(
  contentId: number,
  mode: "auto" | "now" = "auto"
): Promise<PublishResult> {
  const content = getContentById(contentId);
  if (!content) {
    return { ok: false, error: `Content ${contentId} not found` };
  }

  // Phase 9b.2 — carousel rows go via the direct LinkedIn API path
  // (init upload → PUT PDF → POST share). Zernio doesn't support
  // document posts, so we bypass it entirely for these. Scheduling
  // intentionally NOT honored here — the publish is always immediate.
  // For mode="auto" the caller has already decided to publish; if
  // they wanted to defer, they wouldn't have called us.
  const carouselPdfUrl = (content as { carousel_pdf_url?: string | null })
    .carousel_pdf_url;
  if (carouselPdfUrl) {
    void mode; // noted: scheduling for direct-API carousels is a future phase
    return await publishCarouselViaLinkedIn(contentId, content);
  }

  // Resolve image bytes locally, then upload to Zernio's R2 store. The
  // post never references our own server — Zernio hosts the image —
  // so APP_BASE_URL no longer matters. Failures (no bytes, upload
  // failed) fall through to a text-only post; the post itself still
  // ships, never blocking publish on image issues.
  // `image_url` is added by the War Room migration — older clients
  // may not have the field; coerce defensively.
  const ghadaUrl = (content as { image_url?: string | null }).image_url ?? null;
  const media = await resolveMediaBytes(contentId, ghadaUrl);
  let imageUrl: string | undefined;
  if (media) {
    const uploaded = await uploadMediaToZernio(
      media.buffer,
      media.filename,
      media.contentType
    );
    if (uploaded) {
      imageUrl = uploaded;
    } else {
      console.info(
        `[zernio] media upload failed for content ${contentId}; posting text-only`
      );
    }
  } else {
    console.info(
      `[zernio] no image bytes resolved for content ${contentId}; posting text-only`
    );
  }

  const now = new Date();
  const goImmediate = mode === "now" || isInPostingWindow(now);
  const scheduledFor = goImmediate ? undefined : nextPostingSlot(now);

  // Phase 7 — when a carousel rewrite exists, prefer it over the
  // original draft. The original stays in `generated_text` for
  // history and the card-level Original/Carousel toggle.
  const carouselPostText = (content as { carousel_post_text?: string | null })
    .carousel_post_text;
  const publishText =
    carouselPostText && carouselPostText.trim().length > 0
      ? carouselPostText
      : content.generated_text;

  const result = await publishToLinkedIn({
    text: publishText,
    imageUrl,
    scheduledFor,
  });

  if (result.ok) {
    if (scheduledFor) {
      markContentScheduled(contentId, scheduledFor.toISOString());
    } else {
      markContentPublished(contentId, result.url || null);
    }
  }
  return result;
}

/**
 * Phase 9b.2 — direct LinkedIn API path for carousel-bearing rows.
 * Bypasses Zernio entirely; uses our own publisher to do the
 * three-step document upload + post creation. Always publishes
 * immediately (PUBLISHED state) — the scheduling story for direct
 * API needs a separate cron worker, deferred to a future phase.
 *
 * Marks the row published on success; on failure returns the error
 * for the route handler to surface in the manual-paste fallback.
 */
async function publishCarouselViaLinkedIn(
  contentId: number,
  content: NonNullable<ReturnType<typeof getContentById>>
): Promise<PublishResult> {
  const pdfPath = path.join(
    process.cwd(),
    "data",
    "carousels",
    `${contentId}.pdf`
  );
  if (!fs.existsSync(pdfPath)) {
    return {
      ok: false,
      error: `Carousel PDF missing on disk: ${pdfPath}. Regenerate via /api/content/${contentId}/carousel?regenerate=true.`,
    };
  }

  // Document title — taken from the cover slide when available so
  // LinkedIn's doc viewer shows a meaningful name. Fall back to a
  // generic name if the deck JSON is missing or malformed.
  let title = `Code Gem #${contentId}`;
  const deckJson = (content as { carousel_deck_json?: string | null })
    .carousel_deck_json;
  if (deckJson) {
    try {
      const deck = JSON.parse(deckJson) as {
        slides?: Array<{ type: string; title?: string }>;
      };
      const cover = deck.slides?.find((s) => s.type === "cover");
      if (cover?.title) title = cover.title;
    } catch {
      // Malformed deck JSON — keep the fallback title.
    }
  }

  // Post body — Phase 7 narrative rewrite when present, original
  // draft otherwise. Same precedence as the dashboard display + the
  // existing Zernio path below.
  const carouselPostText = (content as { carousel_post_text?: string | null })
    .carousel_post_text;
  const publishText =
    carouselPostText && carouselPostText.trim().length > 0
      ? carouselPostText
      : content.generated_text;

  const result = await publishCarousel({
    contentId,
    postText: publishText,
    pdfPath,
    title,
    lifecycleState: "PUBLISHED",
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.error || "Carousel publish failed (no error message)",
    };
  }

  // postUrl is set for PUBLISHED state — persist it so the dashboard
  // links to the live post.
  markContentPublished(contentId, result.postUrl || null);
  return { ok: true, url: result.postUrl };
}
