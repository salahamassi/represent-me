/**
 * Phase 3 verification — calls Layla's `generateCarouselFromContent`
 * against a real content row, dumps the deck JSON, optionally renders
 * the PDF.
 *
 *   npx tsx scripts/test-carousel-claude.ts                # most recent content row
 *   npx tsx scripts/test-carousel-claude.ts <CONTENT_ID>   # specific row
 *   RENDER=1 npx tsx scripts/test-carousel-claude.ts       # also render PDF
 *
 * Requires ANTHROPIC_API_KEY in env. Skips the API route entirely so
 * we can verify Claude's output independently of route plumbing.
 */

import path from "node:path";
import { initAgents } from "@/agents/bootstrap";
import {
  findRepoContext,
  type ContentAIAgent,
  type GemForRegeneration,
} from "@/agents/ai/content-ai-agent";
import { getContentWithGem, getDb } from "@/lib/db";
import { renderCarousel } from "@/services/carousel-renderer";
import { assembleCarouselPdf } from "@/services/carousel-pdf-service";
import { projectNameFromRepo } from "@/lib/carousel-brands";

interface ContentRow {
  id: number;
  generated_text: string;
  content_type: string;
  created_at: string;
}

function pickContentId(): number {
  const arg = process.argv[2];
  if (arg) {
    const n = Number(arg);
    if (Number.isFinite(n)) return n;
    throw new Error(`Invalid content id "${arg}"`);
  }
  // Default — most recent LinkedIn-style content row that has some
  // substance (≥200 chars) so we don't hand Layla a stub.
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id FROM generated_content WHERE LENGTH(generated_text) > 200 ORDER BY id DESC LIMIT 1"
    )
    .get() as { id: number } | undefined;
  if (!row) {
    throw new Error("No content rows found in DB. Generate one first.");
  }
  return row.id;
}


async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. This script makes a real Claude call."
    );
  }

  const contentId = pickContentId();
  console.log(`[test-carousel-claude] using content_id=${contentId}`);

  const row = getContentWithGem(contentId);
  if (!row) throw new Error(`No content row for id=${contentId}`);

  const content = row.content as unknown as ContentRow;
  const gem = row.gem;
  console.log(
    `[test-carousel-claude] post length=${content.generated_text.length} chars, gem=${gem ? "yes" : "no"}`
  );

  let gemTitle: string | undefined;
  let realProblem: string | undefined;
  let whyInteresting: string | undefined;
  let contentAngle: string | undefined;
  if (gem?.ai_analysis) {
    try {
      const parsed = JSON.parse(gem.ai_analysis) as GemForRegeneration;
      gemTitle = parsed.title;
      realProblem = parsed.realProblem;
      whyInteresting = parsed.whyInteresting;
      contentAngle = parsed.contentAngle;
    } catch {
      // Fall through — the prompt handles missing fields.
    }
  }

  const project = gem?.repo_name
    ? projectNameFromRepo(gem.repo_name)
    : "Salah Nahed";
  const repoContext = gem?.repo_name ? findRepoContext(gem.repo_name) : "";
  console.log(
    `[test-carousel-claude] resolved project="${project}", repoContext=${repoContext.length} chars`
  );

  const agents = initAgents();
  const layla = agents.get("content") as ContentAIAgent | undefined;
  if (!layla) throw new Error("Content agent not registered.");

  console.log("[test-carousel-claude] calling Layla…");
  const start = Date.now();
  const layoutOutput = await layla.generateCarouselFromContent({
    postText: content.generated_text,
    project,
    repoContext,
    gemTitle,
    realProblem,
    whyInteresting,
    contentAngle,
  });
  const { carouselPost, carousel: deck } = layoutOutput;
  console.log(
    `[test-carousel-claude] Claude returned in ${Date.now() - start}ms`
  );

  console.log("\n--- CAROUSEL POST (narrative rewrite) ---");
  console.log(carouselPost);
  console.log(
    `--- END POST (${carouselPost.length} chars) ---\n`
  );

  console.log("--- DECK JSON ---");
  console.log(JSON.stringify(deck, null, 2));
  console.log("--- END DECK ---\n");

  console.log(
    `[test-carousel-claude] deck shape: ${deck.slides.map((s) => s.type).join(" → ")} (${deck.slides.length} slides)`
  );

  if (process.env.RENDER === "1") {
    console.log("[test-carousel-claude] RENDER=1 — rendering PDF…");
    const renderResult = await renderCarousel(deck);
    const outPath = path.join(
      process.cwd(),
      "data",
      "carousels",
      `claude-${contentId}.pdf`
    );
    const pdf = await assembleCarouselPdf(renderResult.slides, outPath, {
      title:
        deck.slides[0]?.type === "cover"
          ? deck.slides[0].title
          : `Carousel ${contentId}`,
      author: "Salah Nahed",
    });
    console.log(
      `[test-carousel-claude] rendered ${pdf.byteLength.toLocaleString()} bytes → ${pdf.path}`
    );
  } else {
    console.log(
      "[test-carousel-claude] RENDER not set — skipping PDF assembly. Re-run with RENDER=1 to produce the file."
    );
  }
}

main().catch((err) => {
  console.error("[test-carousel-claude] failed:", err);
  process.exit(1);
});
