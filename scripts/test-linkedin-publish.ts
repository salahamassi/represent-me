/**
 * Phase 9b verification — publishes ONE carousel to LinkedIn as a
 * DRAFT (lifecycleState=DRAFT). The post is created but doesn't go
 * to followers; it shows up in your "Manage Posts → Drafts" list.
 *
 *   npx tsx scripts/test-linkedin-publish.ts <CONTENT_ID>
 *
 * Defaults to the most recent LinkedIn row that has both a
 * `carousel_pdf_url` and a `carousel_post_text` — i.e. the freshest
 * Phase-7-rewritten draft.
 *
 * Set LIVE=1 to publish for real (lifecycleState=PUBLISHED). Use only
 * after verifying the DRAFT looks right in LinkedIn's UI.
 *
 * After running, check your drafts:
 *   https://www.linkedin.com/post/edit/
 */

import path from "node:path";
import { getDb } from "@/lib/db";
import {
  publishCarousel,
  type LifecycleState,
} from "@/services/linkedin-document-publisher";

interface ContentRow {
  id: number;
  generated_text: string;
  carousel_post_text: string | null;
  carousel_pdf_url: string | null;
  carousel_deck_json: string | null;
}

function pickContentId(): number {
  const arg = process.argv[2];
  if (arg) {
    const n = Number(arg);
    if (!Number.isFinite(n)) {
      throw new Error(`Invalid content id "${arg}"`);
    }
    return n;
  }
  // Default — most recent LinkedIn row with both a carousel PDF AND a
  // carousel-mode post rewrite. That's what would actually publish.
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id FROM generated_content
       WHERE content_type LIKE '%linkedin%'
         AND carousel_pdf_url IS NOT NULL
         AND carousel_post_text IS NOT NULL
       ORDER BY id DESC LIMIT 1`
    )
    .get() as { id: number } | undefined;
  if (!row) {
    throw new Error(
      "No LinkedIn row with both carousel PDF + carousel post text found. Backfill first."
    );
  }
  return row.id;
}

async function main() {
  const contentId = pickContentId();
  console.log(`[test-linkedin-publish] using content_id=${contentId}`);

  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, generated_text, carousel_post_text, carousel_pdf_url,
              carousel_deck_json
       FROM generated_content WHERE id = ?`
    )
    .get(contentId) as ContentRow | undefined;
  if (!row) throw new Error(`No content row for id=${contentId}`);
  if (!row.carousel_pdf_url) {
    throw new Error(`Row ${contentId} has no carousel_pdf_url`);
  }

  const postText = row.carousel_post_text || row.generated_text;
  // Cover-slide title is the cleanest source of a document title.
  // Fall back to a generic name if the deck JSON is malformed.
  let title = `Carousel ${contentId}`;
  if (row.carousel_deck_json) {
    try {
      const parsed = JSON.parse(row.carousel_deck_json) as {
        slides?: Array<{ type: string; title?: string }>;
      };
      const cover = parsed.slides?.find((s) => s.type === "cover");
      if (cover?.title) title = cover.title;
    } catch {
      // Keep fallback title.
    }
  }
  const pdfPath = path.join(
    process.cwd(),
    "data",
    "carousels",
    `${contentId}.pdf`
  );

  const lifecycleState: LifecycleState =
    process.env.LIVE === "1" ? "PUBLISHED" : "DRAFT";

  console.log(
    `[test-linkedin-publish] post text: ${postText.length} chars`
  );
  console.log(`[test-linkedin-publish] title:     "${title}"`);
  console.log(`[test-linkedin-publish] pdf path:  ${pdfPath}`);
  console.log(
    `[test-linkedin-publish] mode:      ${lifecycleState}${lifecycleState === "PUBLISHED" ? " ⚠️  WILL GO LIVE" : " (safe — saved as a draft)"}`
  );
  console.log("");

  const result = await publishCarousel({
    contentId,
    postText,
    pdfPath,
    title,
    lifecycleState,
  });

  if (!result.ok) {
    console.error("[test-linkedin-publish] FAILED");
    console.error(`  error:       ${result.error}`);
    if (result.needsReauth) {
      console.error(
        "  → Re-run /api/linkedin/oauth/start in a browser, then retry."
      );
    }
    if (result.documentUrn) {
      console.error(`  documentUrn (uploaded): ${result.documentUrn}`);
    }
    console.error(`  durationMs:  ${result.durationMs}ms`);
    process.exit(1);
  }

  console.log("[test-linkedin-publish] OK");
  console.log(`  postUrn:     ${result.postUrn}`);
  console.log(`  documentUrn: ${result.documentUrn}`);
  console.log(`  durationMs:  ${result.durationMs}ms`);
  if (result.postUrl) {
    console.log(`  postUrl:     ${result.postUrl}`);
  }
  console.log("");
  if (lifecycleState === "DRAFT") {
    console.log(
      "Open https://www.linkedin.com/post/edit/ to find the draft and verify the carousel renders correctly."
    );
  } else {
    console.log("LIVE post created. Visit the URL above to confirm.");
  }
}

main().catch((err) => {
  console.error("[test-linkedin-publish] threw:", err);
  process.exit(1);
});
