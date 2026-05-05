/**
 * GET /api/war-room/agent-counts
 *
 * Returns the queue size for each operator persona, used to render
 * numeric notification badges on the floor-plan desks. Output:
 *
 *   { Rashid: 5, Layla: 3, Kareem: 2, Yusuf: 4 }
 *
 * Polled by the FloorPlan every ~10s. Tariq is intentionally
 * excluded — his workbench is the live deadline countdown, not a
 * queue, so a numeric badge wouldn't mean anything for him.
 *
 * **Actionable-window filter (added after the daily-driver audit):**
 * each branch only counts items from the last 14 days. Without this
 * the badges read "Kareem 31, Layla 12" because they include legacy
 * rows from months ago — overwhelming and useless for "what needs my
 * attention TODAY". 14d is the rough useful horizon for a job hunt:
 * older items have either been actioned or aren't relevant anymore.
 */

import { NextResponse } from "next/server";
import {
  getDb,
  getRecentContent,
  getSeenJobs,
  getLatestManualLead,
} from "@/lib/db";

export const runtime = "nodejs";

interface SeenJobRow {
  id: string;
  company: string | null;
  approval_status: string | null;
  user_action: string | null;
  fit_percentage: number | null;
  first_seen_at: string;
}

interface ContentRow {
  id: number;
  content_type: string | null;
  user_action: string | null;
  image_url: string | null;
  created_at: string;
}

/** Actionable window — items older than this don't count toward
 *  the desk badges. Same horizon for every persona. Used as the
 *  default cutoff when the client hasn't sent a per-persona seenAt
 *  timestamp (first visit, cleared localStorage, etc.). */
const ACTIONABLE_WINDOW_DAYS = 14;

/** Convert a sqlite timestamp string to epoch ms, or null when it
 *  can't be parsed. Same normalisation as `isWithinWindow`. */
function sqliteTsToMs(sqliteTs: string | null | undefined): number | null {
  if (!sqliteTs) return null;
  const norm = sqliteTs.includes("T") ? sqliteTs : sqliteTs.replace(" ", "T") + "Z";
  const ts = new Date(norm).getTime();
  return Number.isFinite(ts) ? ts : null;
}

/**
 * Build a "is this row newer than the cutoff?" check for a persona.
 * The cutoff is whichever is MORE RECENT of the user's last-seen
 * timestamp (treats the badge as a notification — items already seen
 * don't count) or the 14-day actionable window (caps the lookback so
 * a never-clicked desk doesn't accumulate forever). Falls back to
 * the actionable window when seenAt is missing.
 */
function makeRecencyCheck(seenAtMs: number | undefined) {
  const actionableCutoff = Date.now() - ACTIONABLE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = seenAtMs && seenAtMs > actionableCutoff ? seenAtMs : actionableCutoff;
  return (sqliteTs: string | null | undefined): boolean => {
    const ms = sqliteTsToMs(sqliteTs);
    if (ms === null) return false;
    return ms >= cutoff;
  };
}

/**
 * Parse the `?seenAt=<URL-encoded-JSON>` query param. Shape:
 *   { Rashid: 1730000000000, Layla: ..., Ghada: ..., Kareem: ..., Yusuf: ... }
 * Missing or malformed → empty record (every persona falls back to
 * the 14-day window). URLSearchParams.get() already handles the
 * URL-decoding, so we only need to JSON.parse the raw value.
 */
function parseSeenAt(req: Request): Partial<Record<string, number>> {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("seenAt");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Partial<Record<string, number>> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export async function GET(req: Request) {
  const seenAt = parseSeenAt(req);
  // Source data — same shape used by /api/war-room/queue.
  const allJobs = (getSeenJobs(60) as SeenJobRow[]).filter(
    (j) => j.user_action !== "dismissed"
  );

  // ---- Rashid: Unprocessed Leads (pending_approval, since seenAt) ---
  const rashidRecent = makeRecencyCheck(seenAt.Rashid);
  const rashidByCompany = new Set<string>();
  for (const j of allJobs.filter(
    (j) =>
      j.approval_status === "pending_approval" &&
      rashidRecent(j.first_seen_at)
  )) {
    rashidByCompany.add((j.company || "unknown").toLowerCase());
  }
  const rashidCount = rashidByCompany.size;

  // ---- Kareem: Pending Audits (approved, not yet audited, last 14d) -
  const auditedLeadIds = new Set<string>();
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT detail FROM agent_activity_log
         WHERE (event_type LIKE 'bureaucrat:%' OR event_type LIKE 'kareem:%')
           AND detail IS NOT NULL
         ORDER BY id DESC
         LIMIT 200`
      )
      .all() as { detail: string }[];
    for (const row of rows) {
      const m = row.detail.match(/"(?:jobId|leadId)"\s*:\s*"([^"]+)"/);
      if (m) auditedLeadIds.add(m[1]);
    }
  } catch {
    // Fallback: no audit ledger → treat all approved as pending.
  }
  const kareemRecent = makeRecencyCheck(seenAt.Kareem);
  const kareemByCompany = new Set<string>();
  for (const j of allJobs.filter(
    (j) =>
      (j.approval_status === "approved" || j.approval_status == null) &&
      !auditedLeadIds.has(j.id) &&
      kareemRecent(j.first_seen_at)
  )) {
    kareemByCompany.add((j.company || "unknown").toLowerCase());
  }
  const kareemCount = kareemByCompany.size;

  // ---- Layla: Drafts in flight (since seenAt, not rejected, not done)
  // Past-shipped drafts (`approved` / `published` / `scheduled`) drop
  // off her badge — those aren't "in flight" anymore. The workbench
  // archive view still shows them on demand.
  const laylaRecent = makeRecencyCheck(seenAt.Layla);
  const layla = (getRecentContent(60) as ContentRow[]).filter(
    (c) =>
      c.user_action !== "rejected" &&
      c.user_action !== "approved" &&
      c.user_action !== "published" &&
      c.user_action !== "scheduled" &&
      laylaRecent(c.created_at)
  );
  const laylaCount = layla.length;

  // ---- Ghada: LinkedIn posts awaiting a visual (since seenAt) -------
  const ghadaRecent = makeRecencyCheck(seenAt.Ghada);
  const ghada = (getRecentContent(60) as ContentRow[]).filter(
    (c) =>
      (c.content_type || "").includes("linkedin") &&
      !c.image_url &&
      c.user_action !== "rejected" &&
      ghadaRecent(c.created_at)
  );
  const ghadaCount = ghada.length;

  // ---- Yusuf: brief mix (mirrors his queue) -------------------------
  // Top-job + active manual lead + latest draft → up to 3 items. Each
  // sub-source is gated by Yusuf's seenAt so a stale top job from
  // before he was last opened doesn't keep adding to his badge.
  const yusufRecent = makeRecencyCheck(seenAt.Yusuf);
  const yusufItems: number[] = [];
  const recentJobs = allJobs.filter((j) => yusufRecent(j.first_seen_at));
  if (
    [...recentJobs].sort(
      (a, b) => (b.fit_percentage ?? -1) - (a.fit_percentage ?? -1)
    )[0]
  ) {
    yusufItems.push(1);
  }
  const manual = getLatestManualLead();
  if (manual && yusufRecent(manual.first_seen_at)) {
    yusufItems.push(1);
  }
  const latestDraft = (getRecentContent(1) as ContentRow[])[0];
  if (latestDraft && yusufRecent(latestDraft.created_at)) {
    yusufItems.push(1);
  }
  const yusufCount = yusufItems.length;

  return NextResponse.json({
    Rashid: rashidCount,
    Layla: laylaCount,
    Ghada: ghadaCount,
    Kareem: kareemCount,
    Yusuf: yusufCount,
  });
}
