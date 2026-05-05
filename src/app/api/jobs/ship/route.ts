/**
 * POST /api/jobs/ship
 *
 * Final action of the Bulk Reviewer modal. Atomically flips both
 * `seen_jobs.user_action='applied'` (the Jobs-page truth) AND
 * `seen_jobs.mission_status='SHIPPED'` (the War Room truth) so the
 * row stops appearing in either flow's "to do" list.
 *
 * Unconditional — Bulk Reviewer doesn't gate on a prior KIT_READY
 * transition the way the War Room's mission/ship route does. The
 * semantic here is "Salah confirmed he sent this", which is true
 * regardless of how the row got to this point.
 *
 * Request body: { jobId: string }
 *   200 → { ok: true }
 *   404 → row doesn't exist
 */

import { NextRequest, NextResponse } from "next/server";
import { shipJob } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { jobId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.jobId !== "string" || !body.jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  const updated = shipJob(body.jobId);
  if (!updated) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, jobId: body.jobId });
}
