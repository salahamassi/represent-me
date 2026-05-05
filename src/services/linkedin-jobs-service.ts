/**
 * LinkedIn Jobs search via the local browser skill at
 * ~/.claude/skills/browser/. The skill handles authentication (injects
 * Salah's extracted LinkedIn cookies) and anti-bot bypass (camoufox
 * fingerprint spoofing) so we get real logged-in search results.
 *
 * Pattern parity with job-search-service.ts (Arc.dev): we do ONE scrape
 * per keyword, parse job URLs out of the returned HTML with a regex, and
 * return the same SearchedJob shape. Claude fit scoring happens upstream
 * in the JobMatcher agent — we don't fetch per-job descriptions here.
 *
 * Caveats:
 * 1. Absolute paths to the skill's venv bind this service to Salah's
 *    machine. Before deploying, either rsync the skill into the deploy
 *    or rewrite as a standalone scraper. Fine for local dev.
 * 2. If the LinkedIn cookie (li_at) expires or the skill is missing,
 *    this service logs and returns []. Arc.dev + RemoteOK keep working.
 *    Run `~/.claude/skills/browser/_extract_chrome_cookie.py --domain
 *    linkedin.com --all` once a year (or when scrapes start returning
 *    "Welcome Back" / "Agree & Join" pages).
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import type { JobTemplate } from "@/types";
import { normalizeSearchedJob } from "./job-search-service";

const execFileP = promisify(execFile);

// Pinned absolute paths — the skill's shebang auto-invokes the right venv,
// but we bypass the shebang to ensure we always hit the Python 3.12 venv.
const PY = `${process.env.HOME}/.claude/skills/browser/.venv/bin/python3`;
const ROUTER = `${process.env.HOME}/.claude/skills/browser/browser_router.py`;

interface SearchedJob {
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
}

export interface LinkedInSearch {
  keywords: string;
  /** When true, adds LinkedIn's `f_WT=2` ("Remote") URL filter. Defaults to true. */
  remote?: boolean;
}

/** Default searches — mobile-dev focused, all remote-filtered. */
const DEFAULT_SEARCHES: LinkedInSearch[] = [
  { keywords: "Flutter", remote: true },
  { keywords: "iOS Developer", remote: true },
  { keywords: "Mobile Developer", remote: true },
];

function isSkillInstalled(): boolean {
  return existsSync(PY) && existsSync(ROUTER);
}

async function scrapeHtml(url: string): Promise<string> {
  // Camoufox boots heavy (~500MB RAM, 10-30s warmup). Give it 2 minutes
  // and a 10MB stdout buffer — LinkedIn search HTML is ~300KB.
  const { stdout } = await execFileP(
    PY,
    [ROUTER, "run", "--url", url, "--action", "html"],
    { maxBuffer: 10 * 1024 * 1024, timeout: 120_000 }
  );
  return stdout;
}

function buildSearchUrl(search: LinkedInSearch): string {
  const params = new URLSearchParams({ keywords: search.keywords });
  if (search.remote !== false) params.set("f_WT", "2");
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

function slugToHuman(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Extract jobs from LinkedIn search HTML. The URL pattern is:
 *   /jobs/view/{title-slug}-at-{company-slug}-{jobId}?position=N&...
 * The 8-10 digit numeric ID uniquely identifies the job. We split the slug
 * on the last `-at-` to separate title from company — LinkedIn follows
 * that convention for every result.
 */
function extractJobs(html: string): SearchedJob[] {
  const regex = /jobs\/view\/([a-z0-9-]+?)-(\d{8,})[?"&]/gi;
  const seenIds = new Set<string>();
  const out: SearchedJob[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    const [, slug, id] = match;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const atIdx = slug.lastIndexOf("-at-");
    const titleSlug = atIdx >= 0 ? slug.slice(0, atIdx) : slug;
    const companySlug = atIdx >= 0 ? slug.slice(atIdx + 4) : "Unknown Company";

    out.push({
      title: slugToHuman(titleSlug),
      company: slugToHuman(companySlug),
      // LinkedIn doesn't surface location reliably in search result HTML
      // (it's rendered server-side per-card in structured containers that
      // our regex scraper can't see). Since we filter f_WT=2 (Remote),
      // tagging "Remote" is accurate enough for Claude's fit scoring.
      location: "Remote",
      url: `https://www.linkedin.com/jobs/view/${id}/`,
      source: "linkedin",
    });
  }

  return out;
}

/**
 * Fetch jobs from LinkedIn Jobs search. Each search runs ONE scrape of
 * page 1 (~25 jobs max). Multiple searches run sequentially with a small
 * delay to stay under LinkedIn's rate limits.
 *
 * Returns an empty array (not an error) if the skill isn't installed or
 * scraping fails, so the JobMatcher agent degrades gracefully.
 */
export async function fetchLinkedInJobs(
  searches: LinkedInSearch[] = DEFAULT_SEARCHES,
  opts: { delayBetweenSearchesMs?: number; maxPerSearch?: number } = {}
): Promise<SearchedJob[]> {
  const { delayBetweenSearchesMs = 5000, maxPerSearch = 25 } = opts;

  if (!isSkillInstalled()) {
    console.warn(
      "[LinkedIn Jobs] Browser skill not found at ~/.claude/skills/browser/. Skipping."
    );
    return [];
  }

  const seenIds = new Set<string>();
  const allJobs: SearchedJob[] = [];

  for (let i = 0; i < searches.length; i++) {
    const search = searches[i];
    if (i > 0) {
      await new Promise((r) => setTimeout(r, delayBetweenSearchesMs));
    }

    const url = buildSearchUrl(search);
    try {
      const html = await scrapeHtml(url);

      // Sniff-test auth: if LinkedIn returned the "Agree & Join" or
      // "Welcome Back" splash the cookies have expired. Bail the whole
      // run early — retrying just burns camoufox boot time.
      if (/Agree &amp; Join LinkedIn|Welcome Back/i.test(html.slice(0, 10_000))) {
        console.warn(
          "[LinkedIn Jobs] Authenticated scrape failed (login splash returned). The li_at cookie likely expired. Re-run: ~/.claude/skills/browser/_extract_chrome_cookie.py --domain linkedin.com --all"
        );
        return allJobs;
      }

      const jobs = extractJobs(html).slice(0, maxPerSearch);
      let added = 0;
      for (const job of jobs) {
        const id = job.url.match(/\/view\/(\d+)/)?.[1];
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        allJobs.push(job);
        added++;
      }
      console.log(
        `[LinkedIn Jobs] "${search.keywords}": ${added} new (${jobs.length} total matched)`
      );
    } catch (err) {
      console.warn(
        `[LinkedIn Jobs] Search "${search.keywords}" failed:`,
        err instanceof Error ? err.message : err
      );
      // Keep going — other searches might still succeed.
    }
  }

  return allJobs;
}

/**
 * Convenience: fetch LinkedIn jobs and normalize them to JobTemplate for
 * the JobMatcher agent. Mirrors the normalize pattern used for Arc.dev.
 */
export async function fetchLinkedInJobsNormalized(
  searches?: LinkedInSearch[]
): Promise<JobTemplate[]> {
  const jobs = await fetchLinkedInJobs(searches);
  return jobs.map(normalizeSearchedJob);
}
