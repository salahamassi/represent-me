/**
 * POST /api/war-room/lead/[leadId]/mission/ship
 *
 * Final transition in the mission state machine: KIT_READY → SHIPPED.
 * Salah clicks "Mark shipped" in the lead detail panel after the
 * cover letter lands and he's actually sent the application.
 *
 * Behaviour:
 *   - 200 + `{ shipped: true }` if the row was KIT_READY.
 *   - 409 + `{ currentStatus }` if the row is in any other state.
 *     (Can't ship from READY — there's no kit. Can't re-ship from
 *     SHIPPED — it's terminal.)
 *   - 404 if the leadId doesn't exist.
 *
 * The transition is atomic via a WHERE-guarded UPDATE — concurrent
 * clicks from two tabs serialize and only the first matches.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getMissionStatus, logActivity } from "@/lib/db";
import { getAgentBus } from "@/agents/base/agent-bus";
import { initAgents } from "@/agents/bootstrap";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  // Make sure subscribers attach so mission:shipped doesn't land in
  // a void if downstream agents care about it.
  initAgents();

  const { leadId } = await params;
  if (!leadId) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  const db = getDb();
  const exists = db
    .prepare("SELECT id, company FROM seen_jobs WHERE id = ?")
    .get(leadId) as { id: string; company: string | null } | undefined;
  if (!exists) {
    return NextResponse.json(
      { shipped: false, error: "Lead not found", leadId },
      { status: 404 }
    );
  }

  // Conditional UPDATE — only flips if currently KIT_READY. Concurrent
  // clicks serialize at the SQLite layer; only one wins.
  const result = db
    .prepare(
      `UPDATE seen_jobs
       SET mission_status = 'SHIPPED'
       WHERE id = ?
         AND mission_status = 'KIT_READY'`
    )
    .run(leadId);

  if (result.changes === 0) {
    return NextResponse.json(
      {
        shipped: false,
        reason: "not_kit_ready",
        currentStatus: getMissionStatus(leadId),
        leadId,
      },
      { status: 409 }
    );
  }

  // Log + publish for the SSE bridge so the floor's chatter and the
  // Yusuf chat can react.
  try {
    logActivity({
      agentId: "system",
      eventType: "mission:shipped",
      title: `Mission shipped · ${exists.company || "lead"}`,
      detail: JSON.stringify({
        leadId,
        company: exists.company,
        shippedAt: new Date().toISOString(),
      }),
    });
  } catch {
    // non-fatal
  }

  try {
    const bus = getAgentBus();
    void bus.publish("mission:shipped", "system", {
      leadId,
      company: exists.company,
      shippedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[mission/ship] bus publish failed", err);
  }

  return NextResponse.json({
    shipped: true,
    leadId,
    status: "SHIPPED",
  });
}
