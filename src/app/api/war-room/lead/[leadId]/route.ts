/**
 * GET /api/war-room/lead/[leadId]
 *
 * Returns the full `seen_jobs` row for a single lead so the workbench
 * detail panel can render its deep-dive view (reasoning, matched
 * skills, gaps, application tip).
 *
 * Returns 404 if the row doesn't exist. We don't paginate or filter
 * here — this endpoint is single-row by design.
 */

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { leadId } = await params;
  if (!leadId) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  const db = getDb();
  // Cast keeps TS honest — better-sqlite3 returns `unknown` here.
  const row = db
    .prepare(
      `SELECT id, source, title, company, url, fit_percentage,
              ai_analysis, jd_text, contact_name, kit_status,
              user_action, first_seen_at,
              mission_status, mission_started_at,
              mission_error, mission_error_at
       FROM seen_jobs
       WHERE id = ?`
    )
    .get(leadId) as Record<string, unknown> | undefined;

  if (!row) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json({ lead: row });
}
