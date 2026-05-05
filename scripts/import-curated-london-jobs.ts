#!/usr/bin/env tsx
/**
 * One-shot import for the hand-curated London, UK mobile-dev roles from
 * src/data/curated-london-jobs.ts. Inserts each job into seen_jobs with:
 *   - source = "curated-london"
 *   - fit_percentage = curator's 1-10 fitScore × 10
 *   - ai_analysis = JSON blob with rank, visa, workModel, category, reason,
 *     so the Jobs UI can render the curator's context alongside any later
 *     Claude scoring.
 *   - url = real LinkedIn URL when present, otherwise a LinkedIn search
 *     URL fallback (keywords=title+company+London) so one click lands you
 *     in the right search.
 *
 * Run with:
 *   npx tsx scripts/import-curated-london-jobs.ts
 * or via the package.json shortcut:
 *   npm run import:london
 *
 * Idempotent — safe to re-run (markJobSeen uses INSERT OR IGNORE and the
 * updateJobAIAnalysis call refreshes the enrichment JSON each time).
 */

import { markJobSeen, updateJobAIAnalysis } from "../src/lib/db";
import {
  CURATED_LONDON_JOBS,
  type CuratedLondonJob,
} from "../src/data/curated-london-jobs";

/**
 * LinkedIn Jobs search URL fallback for rows without a direct posting link.
 * Clicking this takes the user to a ~1-second LinkedIn search, filtered
 * down to the right city + remote-friendly flag, so they can find the
 * actual posting in one hop.
 */
function buildSearchFallback(job: CuratedLondonJob): string {
  const keywords = `${job.title} ${job.company}`;
  const params = new URLSearchParams({
    keywords,
    location: "London, England, United Kingdom",
  });
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function buildJobId(job: CuratedLondonJob): string {
  // Zero-pad rank for stable lex-sort on the DB id if it matters later.
  const rank = job.rank.toString().padStart(2, "0");
  const slug = slugify(`${job.company}-${job.title}`);
  return `london-${rank}-${slug}`;
}

function run(): void {
  console.log(
    `[import:london] Inserting ${CURATED_LONDON_JOBS.length} curated London jobs...`
  );

  let inserted = 0;
  let enriched = 0;

  for (const job of CURATED_LONDON_JOBS) {
    const id = buildJobId(job);
    const url = job.url || buildSearchFallback(job);
    const fitPercentage = Math.round(job.fitScore * 10);

    try {
      markJobSeen({
        id,
        // Use a distinct source so the Jobs page can filter/badge these
        // separately from the agent-discovered jobs in seen_jobs.
        source: "curated-london",
        title: job.title,
        company: job.company,
        url,
        fitPercentage,
        matchedSkills: job.techStack,
        missingSkills: [],
      });
      inserted++;

      // Store the curator's extra context (visa, work model, category,
      // one-line reason, posting freshness) in the ai_analysis column as
      // JSON. Reuses the existing schema — no DB migration needed, and the
      // Jobs UI can JSON.parse it when rendering enriched cards.
      const enrichment = {
        source: "curated-london",
        rank: job.rank,
        visa: job.visa,
        workModel: job.workModel,
        category: job.category,
        location: job.location,
        reason: job.reason,
        postedInfo: job.postedInfo,
        urlKind: job.url ? "direct" : "search-fallback",
      };
      updateJobAIAnalysis(
        id,
        JSON.stringify(enrichment),
        job.salary ?? undefined
      );
      enriched++;

      const visaTag = job.visa.padEnd(8);
      const urlTag = job.url ? "🔗" : "🔍";
      console.log(
        `  ${urlTag} #${job.rank.toString().padStart(2, " ")} ${job.category} ${visaTag} ${fitPercentage}% ${job.title} @ ${job.company}`
      );
    } catch (err) {
      console.error(
        `  ✗ Failed to insert #${job.rank} ${job.title} @ ${job.company}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log(
    `\n[import:london] Done. Inserted ${inserted}/${CURATED_LONDON_JOBS.length}, enriched ${enriched}.`
  );
  console.log(
    `[import:london] 🔗 = direct LinkedIn URL · 🔍 = LinkedIn search fallback (no direct link in source).`
  );
}

run();
