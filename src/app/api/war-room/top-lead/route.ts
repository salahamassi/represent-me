/**
 * GET /api/war-room/top-lead
 *
 * Returns the single most-actionable lead for the Command Bar at the
 * top of the War Room. Selection logic:
 *
 *   1. PRIORITY 1 — A manual lead (Obeida flow) whose `kit_status` is
 *      `kit-ready`. These were paste-imported by Salah and explicitly
 *      taken through the Saqr/Layla/Kareem chain, so they're the most
 *      "ready to apply" thing in the system.
 *
 *   2. PRIORITY 2 — Highest `fit_percentage` job among non-dismissed
 *      `seen_jobs` rows. Falls back to "no lead" if the table is empty
 *      or everything is dismissed.
 *
 * Pin behaviour: the Command Bar can override this default by passing
 * `?leadId=…`, in which case we return that lead verbatim. This lets
 * the user "pin" a lead to the bar (via localStorage on the client)
 * even after a higher-fit job lands. The pin is cleared client-side
 * when the apply chain completes or the user dismisses.
 *
 * The response shape is uniform across both paths so the Command Bar
 * doesn't need to branch on lead source. `kind` carries that signal.
 */

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export interface TopLead {
  /** Stable lead id — matches `seen_jobs.id`. */
  leadId: string;
  /** Source of the lead — drives which download endpoints to use. */
  kind: "manual-lead" | "scouted-job";
  company: string;
  jobTitle: string | null;
  /** External posting URL when known. The Command Bar's "Go to job
   *  page" prefers this; falls back to /jobs/{leadId} for internal. */
  jobUrl: string | null;
  fitPercentage: number | null;
  /** True when the kit (resume PDF + cover letter) is ready. */
  hasKit: boolean;
  /** Endpoint paths — null when the asset doesn't exist. The bar
   *  conditionally renders the download buttons based on these. */
  resumePath: string | null;
  coverPath: string | null;
  /** When the resume is downloadable, what should the file label say. */
  resumeFilename?: string;
  /** Free-text summary of the lead's status — shown under the title.
   *  Examples: "Kit ready", "Awaiting analysis", "Apply window 30 min". */
  status: string;
  /** Approval gate state — drives whether the Command Bar shows the
   *  "Approve Mission" CTA or the kit downloads. */
  approvalStatus: "pending_approval" | "approved" | null;
}

interface SeenJobRow {
  id: string;
  source: string | null;
  title: string | null;
  company: string | null;
  url: string | null;
  fit_percentage: number | null;
  user_action: string | null;
  resume_id: number | null;
  kit_status: string | null;
  kit_resume_path: string | null;
  cover_letter_text: string | null;
  approval_status: string | null;
}

interface ResumeRow {
  id: number;
  pdf_path: string;
}

/** Shared "this lead is no longer top-of-funnel" filter. Excludes:
 *   - rows the user explicitly dismissed
 *   - rows the user already applied to (`applied`)
 *   - rows the user deferred (`apply_later`)
 *   - rows whose mission has been SHIPPED to LinkedIn — done is done
 * Without these exclusions the Command Bar surfaces shipped jobs as
 * "review then apply" indefinitely (the bug that motivated this filter). */
const ACTIVE_LEAD_FILTER = `
  COALESCE(user_action, '') NOT IN ('dismissed', 'applied', 'apply_later')
  AND COALESCE(mission_status, '') != 'SHIPPED'
`;

/** Query the latest manual lead with a ready kit. Most recent wins
 *  because Salah will have just created it via the Manual Lead dialog. */
function findKitReadyManualLead(): SeenJobRow | null {
  const db = getDb();
  return (
    (db
      .prepare(
        `SELECT * FROM seen_jobs
         WHERE source = 'manual-lead'
           AND kit_status = 'kit-ready'
           AND ${ACTIVE_LEAD_FILTER}
         ORDER BY first_seen_at DESC
         LIMIT 1`
      )
      .get() as SeenJobRow | undefined) || null
  );
}

/** Highest-fit active job. Used when no manual lead is kit-ready. */
function findTopFitJob(): SeenJobRow | null {
  const db = getDb();
  return (
    (db
      .prepare(
        `SELECT * FROM seen_jobs
         WHERE ${ACTIVE_LEAD_FILTER}
         ORDER BY fit_percentage DESC, first_seen_at DESC
         LIMIT 1`
      )
      .get() as SeenJobRow | undefined) || null
  );
}

/** True when the lead has been actioned (applied / dismissed / shipped /
 *  deferred) and shouldn't be surfaced even via a stale client-side pin. */
function isStale(row: SeenJobRow): boolean {
  const ua = row.user_action || "";
  if (ua === "dismissed" || ua === "applied" || ua === "apply_later") return true;
  // mission_status is on the row but not in the SeenJobRow interface;
  // read it defensively.
  const ms = (row as unknown as { mission_status?: string | null }).mission_status || "";
  return ms === "SHIPPED";
}

/** Get the latest generated resume PDF path for a given job_id. */
function findResumeForJob(jobId: string): ResumeRow | null {
  const db = getDb();
  return (
    (db
      .prepare(
        `SELECT id, pdf_path FROM generated_resumes
         WHERE job_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(jobId) as ResumeRow | undefined) || null
  );
}

/** Fetch a single lead by id (used by the `?leadId=…` pin path). */
function findLeadById(leadId: string): SeenJobRow | null {
  const db = getDb();
  return (
    (db
      .prepare(`SELECT * FROM seen_jobs WHERE id = ?`)
      .get(leadId) as SeenJobRow | undefined) || null
  );
}

/** Project a `seen_jobs` row into the Command-Bar response shape. */
function shapeRow(row: SeenJobRow): TopLead {
  const isManual = row.source === "manual-lead";

  // Kit detection differs by source:
  //   - Manual lead: kit_status === 'kit-ready' AND files written
  //   - Scouted job: a generated_resumes row exists for this job_id
  let resumePath: string | null = null;
  let coverPath: string | null = null;
  let hasKit = false;
  let resumeFilename: string | undefined;

  if (isManual) {
    if (row.kit_status === "kit-ready" && row.kit_resume_path) {
      resumePath = `/api/manual-lead/${encodeURIComponent(row.id)}/resume`;
      hasKit = true;
      resumeFilename = path.basename(row.kit_resume_path);
    }
    if (row.cover_letter_text) {
      coverPath = `/api/manual-lead/${encodeURIComponent(row.id)}/cover`;
      hasKit = true;
    }
  } else {
    // Scouted: check generated_resumes for a row tied to this job_id.
    const resume = findResumeForJob(row.id);
    if (resume) {
      const filename = path.basename(resume.pdf_path);
      resumePath = `/api/jobs/resume?file=${encodeURIComponent(filename)}`;
      resumeFilename = filename;
      hasKit = true;
    }
  }

  // Status copy — terse, scannable. Reads as "what's true about this
  // lead right now" so Salah can prioritise without thinking.
  // Pending-approval rows get a distinct status so the bar's CTA
  // ("Approve Mission") makes sense alongside the copy.
  let status: string;
  const pendingApproval = row.approval_status === "pending_approval";
  if (pendingApproval) {
    status =
      row.fit_percentage != null
        ? `${row.fit_percentage}% fit · awaiting your approval`
        : "Awaiting your approval";
  } else if (isManual && row.kit_status === "kit-ready") {
    status = "Kit ready · ship it";
  } else if (isManual && row.kit_status === "error") {
    status = "Kit failed · click for chat";
  } else if (isManual) {
    status = `Manual lead · ${row.kit_status || "in flight"}`;
  } else if (hasKit) {
    status = "Resume tailored · review then apply";
  } else if (row.fit_percentage != null) {
    status = `${row.fit_percentage}% fit · awaiting kit`;
  } else {
    status = "Awaiting analysis";
  }

  return {
    leadId: row.id,
    kind: isManual ? "manual-lead" : "scouted-job",
    company: row.company || "Unknown company",
    jobTitle: row.title,
    jobUrl: row.url,
    fitPercentage: row.fit_percentage,
    hasKit,
    resumePath,
    coverPath,
    resumeFilename,
    status,
    approvalStatus:
      row.approval_status === "approved" || row.approval_status === "pending_approval"
        ? row.approval_status
        : null,
  };
}

export async function GET(req: NextRequest) {
  const pinnedId = req.nextUrl.searchParams.get("leadId");

  // Pin path — explicit lead id wins regardless of selection logic,
  // but a pinned lead that's been actioned (applied / shipped / deferred)
  // gets `stale: true` so the client can auto-clear the pin instead of
  // showing a finished mission as "review then apply" forever.
  if (pinnedId) {
    const generic = findLeadById(pinnedId);
    if (!generic) {
      return NextResponse.json({ error: "Pinned lead not found" }, { status: 404 });
    }
    if (isStale(generic)) {
      // Don't return the lead — the client should clear the pin and
      // re-fetch the current top-of-funnel candidate.
      return NextResponse.json({ lead: null, stale: true, pinnedId });
    }
    return NextResponse.json({ lead: shapeRow(generic) });
  }

  // Default selection — manual-lead with ready kit beats best-fit job.
  const top = findKitReadyManualLead() || findTopFitJob();
  if (!top) {
    return NextResponse.json({ lead: null });
  }
  return NextResponse.json({ lead: shapeRow(top) });
}
