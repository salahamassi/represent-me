/**
 * GET /api/war-room/drafts?tab=social|application
 *
 * Powers the Drafts panel that drops down from the Command Bar.
 * Replaces the panel's previous `?role=Layla` queue call so the user
 * can filter by category — most of the time Salah just wants to
 * publish a LinkedIn post and dip out, which is what the "Social" tab
 * is optimised for.
 *
 * Two categories:
 *
 *   social      → `generated_content` rows where content_type matches
 *                 a publishable social/article format (LinkedIn / Medium
 *                 / Dev.to / generic article).
 *
 *   application → cover letters from manual leads (`seen_jobs.cover_letter_text`,
 *                 the Obeida flow) plus any `cover_letter` / `resume_content`
 *                 rows in `generated_content`.
 *
 * Each item carries the FULL text inline so the panel can copy without
 * a follow-up fetch — drafts are small (≤ a few KB) and the panel only
 * loads top 8 per tab, so payload stays trim.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, updateContentAction, getContentById } from "@/lib/db";
import { publishContentRow } from "@/services/zernio-service";

export const runtime = "nodejs";

/**
 * PATCH /api/war-room/drafts — lifecycle promotion for a single draft.
 *
 * Body: `{ contentId: number, status: 'published' | 'scheduled' | 'approved' | 'rejected' }`
 *
 * Used by Yusuf's "Approve & Copy" inline review — once Salah confirms
 * a draft, we flip its `user_action` so it drops out of the active
 * queue and lands in the archive view. Distinct from the older
 * `POST /api/war-room/content/[id]/approve` which is the lighter
 * "mark approved" path; PATCH is the explicit "lifecycle promote".
 *
 * Returns the new row state so the client can reconcile optimistically.
 */
const ALLOWED_STATUSES = new Set([
  "approved",
  "published",
  "scheduled",
  "rejected",
]);

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const contentId = Number(body.contentId);
  const status = String(body.status || "");

  if (!Number.isFinite(contentId) || contentId <= 0) {
    return NextResponse.json({ error: "Invalid contentId" }, { status: 400 });
  }
  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json(
      { error: `Invalid status. Allowed: ${Array.from(ALLOWED_STATUSES).join(", ")}` },
      { status: 400 }
    );
  }

  try {
    // Promotion to "published" is the SHIP TO LINKEDIN path: we call
    // Zernio to actually post the content, not just flip a flag. The
    // server only returns ok=true once the post is confirmed live —
    // that's the contract the workbench relies on for "decrement
    // Chains Active only after API confirms".
    //
    // Other statuses (approved / scheduled / rejected) are still
    // simple lifecycle markers — no Zernio call.
    if (status === "published") {
      // Sanity — make sure the content row exists before hitting Zernio
      // (the publish call would otherwise fail with a less helpful
      // "content not found" message buried in the result body).
      const exists = getContentById(contentId);
      if (!exists) {
        return NextResponse.json(
          { error: "Content not found" },
          { status: 404 }
        );
      }

      // v3 — switched from "now" to "auto" so Yusuf's posting-window
      // logic decides immediate vs scheduled. Inside Mon–Fri 9 AM–6 PM
      // → publish live; outside → auto-schedule to the next slot.
      // The response carries `scheduledAt` when the post got queued
      // instead of published, so the client can show a different
      // success state ("Scheduled for Mon 10:30").
      const result = await publishContentRow(contentId, "auto");
      if (!result.ok) {
        return NextResponse.json(
          {
            ok: false,
            contentId,
            error: result.error || "Zernio publish failed",
          },
          { status: 502 }
        );
      }
      // publishContentRow already flips user_action to 'published' /
      // 'scheduled' inside, so we don't double-write here. Re-read
      // the row to return the source-of-truth state to the client.
      const db = getDb();
      const row = db
        .prepare(
          "SELECT id, content_type, user_action, linkedin_post_url, scheduled_for FROM generated_content WHERE id = ?"
        )
        .get(contentId) as
        | {
            id: number;
            content_type: string | null;
            user_action: string | null;
            linkedin_post_url: string | null;
            scheduled_for: string | null;
          }
        | undefined;
      return NextResponse.json({
        ok: true,
        contentId,
        status: row?.user_action || "published",
        contentType: row?.content_type ?? null,
        // Either postUrl (immediate publish) or scheduledAt (queued).
        // The "now" mode means we expect the URL on success, but the
        // posting-window logic inside publishContentRow may still
        // schedule if Zernio is set up that way — surface both.
        postUrl: row?.linkedin_post_url || result.url || null,
        scheduledAt: row?.scheduled_for || result.scheduledAt || null,
      });
    }

    // Lightweight lifecycle marker — used for `approved` / `scheduled`
    // / `rejected` flows where we don't want to call Zernio.
    updateContentAction(contentId, status);
    const db = getDb();
    const row = db
      .prepare(
        "SELECT id, content_type, user_action FROM generated_content WHERE id = ?"
      )
      .get(contentId) as
      | { id: number; content_type: string | null; user_action: string | null }
      | undefined;
    if (!row) {
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      contentId: row.id,
      status: row.user_action,
      contentType: row.content_type,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export type DraftTab = "social" | "application";

export interface DraftItem {
  /** Unique id with kind prefix so React keys stay stable across mixed
   *  sources (`content:42`, `manual-cover:manual-lead-…`). */
  id: string;
  /** Origin of the item — drives the chat handoff (Layla for posts and
   *  cover-letter writing, Kareem for resume content). */
  kind: "content" | "manual-cover";
  /** Tab this item belongs to — useful to the client when both tabs
   *  later share a single fetch (we don't today, but it future-proofs). */
  tab: DraftTab;
  /** Title-ish line — first ~60 chars of the body. */
  primary: string;
  /** Mono subtitle — content type + word count or company name. */
  secondary: string;
  /** Full text — copied to clipboard verbatim by the panel. */
  fullText: string;
  /** Optional original-row id for follow-up actions (e.g. linking to
   *  the content's edit page). Present for `content` kind only. */
  contentId?: number;
  /** Optional company name — used by application items to route the
   *  chat handoff to the right lead. */
  company?: string | null;
}

/** Categorisation rules — kept in one place so future content types
 *  slot in by name without touching the route logic. The `social`
 *  bucket includes anything publishable on a public channel; the
 *  `application` bucket is everything attached to a job application. */
const SOCIAL_CONTENT_TYPES = new Set<string>([
  "gem_linkedin_post",
  "linkedin_post",
  "gem_medium_post",
  "medium_article",
  "article",
  "gem_devto_post",
  "devto_post",
]);
const APPLICATION_CONTENT_TYPES = new Set<string>([
  "cover_letter",
  "resume_content",
]);

interface ContentRow {
  id: number;
  content_type: string | null;
  generated_text: string | null;
  created_at: string;
  user_action: string | null;
}

interface ManualCoverRow {
  id: string;
  company: string | null;
  cover_letter_text: string | null;
  first_seen_at: string;
}

/** Word-count proxy — split on whitespace, drop empties. Good enough
 *  for "142 words" subtitles; we don't tokenise punctuation. */
function wordCount(s: string | null): number {
  if (!s) return 0;
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Pretty content-type label for the secondary line. */
function prettyType(t: string | null): string {
  if (!t) return "draft";
  return t
    .replace(/^gem_/, "")
    .replace(/_/g, " ")
    .replace(/\bpost\b/, "post")
    .replace(/\bdevto\b/, "Dev.to");
}

/** Truncate a body to the preview length used by `primary`. */
function previewLine(body: string | null): string {
  return (body || "").trim().replace(/\s+/g, " ").slice(0, 70) || "(empty draft)";
}

export async function GET(req: NextRequest) {
  const tab = (req.nextUrl.searchParams.get("tab") as DraftTab) || "social";
  if (tab !== "social" && tab !== "application") {
    return NextResponse.json({ error: "Unknown tab" }, { status: 400 });
  }

  const db = getDb();
  const items: DraftItem[] = [];

  // Pick the right set of content_types for this tab. We over-fetch
  // a bit and slice client-side after combining sources.
  const allowedTypes =
    tab === "social" ? SOCIAL_CONTENT_TYPES : APPLICATION_CONTENT_TYPES;
  const placeholders = Array.from(allowedTypes).map(() => "?").join(",");

  const contentRows = (db
    .prepare(
      `SELECT id, content_type, generated_text, created_at, user_action
       FROM generated_content
       WHERE content_type IN (${placeholders})
       ORDER BY created_at DESC
       LIMIT 12`
    )
    .all(...Array.from(allowedTypes))) as ContentRow[];

  for (const c of contentRows) {
    const text = c.generated_text || "";
    items.push({
      id: `content:${c.id}`,
      kind: "content",
      tab,
      primary: previewLine(text),
      secondary: `${prettyType(c.content_type)} · ${wordCount(text)} words`,
      fullText: text,
      contentId: c.id,
    });
  }

  // Application tab additionally pulls cover letters from manual-leads.
  // These live on the seen_jobs row directly (no generated_content row),
  // so we fetch them separately and merge.
  //
  // Approval gate: only show cover letters whose lead is `approved` (or
  // legacy NULL — pre-gate rows are treated as approved). A pending lead
  // shouldn't even be able to have a cover letter (Layla / Amin won't
  // run), but we belt-and-brace the filter so the panel never shows
  // speculative drafts.
  if (tab === "application") {
    const coverRows = (db
      .prepare(
        `SELECT id, company, cover_letter_text, first_seen_at
         FROM seen_jobs
         WHERE source = 'manual-lead'
           AND cover_letter_text IS NOT NULL
           AND length(cover_letter_text) > 0
           AND (approval_status IS NULL OR approval_status = 'approved')
         ORDER BY first_seen_at DESC
         LIMIT 8`
      )
      .all()) as ManualCoverRow[];

    for (const r of coverRows) {
      const text = r.cover_letter_text || "";
      items.push({
        id: `manual-cover:${r.id}`,
        kind: "manual-cover",
        tab,
        primary: previewLine(text),
        secondary: `cover letter · ${r.company || "manual lead"} · ${wordCount(text)} words`,
        fullText: text,
        company: r.company,
      });
    }
  }

  // Final sort by recency-equivalent: content rows already come back
  // newest-first; manual-cover rows mix in by their first_seen_at. We
  // sort by the first numeric segment of `id` (timestamp prefix for
  // manual leads, monotonic id for content) — good-enough proxy.
  items.sort((a, b) => {
    const aN = Number(a.id.match(/\d+/g)?.slice(-1)[0] ?? 0);
    const bN = Number(b.id.match(/\d+/g)?.slice(-1)[0] ?? 0);
    return bN - aN;
  });

  return NextResponse.json({ tab, items: items.slice(0, 8) });
}
