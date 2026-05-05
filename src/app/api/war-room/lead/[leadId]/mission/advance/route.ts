/**
 * POST /api/war-room/lead/[leadId]/mission/advance
 *
 * Manual override that flips IN_PROGRESS → KIT_READY without waiting
 * for both Layla AND Kareem artefacts. Use case: Salah's lead has no
 * `ai_analysis` so Kareem skipped, but Layla wrote the cover letter
 * and Salah just wants to ship without a tailored CV.
 *
 * Strict gate — only flips from IN_PROGRESS. Will NOT downgrade a
 * SHIPPED or KIT_READY row, and won't fast-forward from READY (which
 * would skip the mission start entirely).
 *
 * Honest framing: this is an admin override, not the happy path. The
 * UI should call this only after surfacing the partial-completion
 * state to Salah and getting his explicit click.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getMissionStatus, clearMissionError, logActivity } from "@/lib/db";
import { getAgentBus } from "@/agents/base/agent-bus";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { leadId } = await params;
  if (!leadId) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  const db = getDb();
  const row = db
    .prepare("SELECT id, company FROM seen_jobs WHERE id = ?")
    .get(leadId) as { id: string; company: string | null } | undefined;
  if (!row) {
    return NextResponse.json(
      { advanced: false, error: "Lead not found", leadId },
      { status: 404 }
    );
  }

  // Only IN_PROGRESS → KIT_READY. Anything else is a no-op.
  const result = db
    .prepare(
      `UPDATE seen_jobs
       SET mission_status = 'KIT_READY'
       WHERE id = ?
         AND mission_status = 'IN_PROGRESS'`
    )
    .run(leadId);

  if (result.changes === 0) {
    return NextResponse.json(
      {
        advanced: false,
        reason: "not_in_progress",
        currentStatus: getMissionStatus(leadId),
        leadId,
      },
      { status: 409 }
    );
  }

  clearMissionError(leadId);

  try {
    logActivity({
      agentId: "system",
      eventType: "mission:force-advanced",
      title: `Mission force-advanced to KIT_READY · ${row.company || "lead"}`,
      detail: JSON.stringify({
        leadId,
        company: row.company,
        at: new Date().toISOString(),
      }),
    });
  } catch {
    // non-fatal
  }

  try {
    const bus = getAgentBus();
    void bus.publish("mission:kit-ready", "system", {
      leadId,
      company: row.company,
      forced: true,
    });
  } catch (err) {
    console.error("[mission/advance] bus publish failed", err);
  }

  return NextResponse.json({
    advanced: true,
    leadId,
    status: "KIT_READY",
  });
}
