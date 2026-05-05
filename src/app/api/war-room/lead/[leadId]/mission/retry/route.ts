/**
 * POST /api/war-room/lead/[leadId]/mission/retry
 *
 * Retry a stalled / errored mission. Used when Layla or Kareem caught
 * an exception during their mission:started run and recorded it via
 * `recordMissionError`. The retry:
 *
 *   1. Clears the mission_error fields on the row (so the UI no
 *      longer surfaces the "Retry" affordance).
 *   2. Re-publishes `mission:started` with the same payload shape
 *      the original `/mission/start` route used.
 *
 * Doesn't touch `mission_status` — the row is still IN_PROGRESS
 * (or whatever it was). The agents themselves are idempotent on
 * `mission:started`: Layla writes a fresh content row, Kareem skips
 * if a resume already exists.
 *
 * Returns 200 + `{ retried: true }` on success.
 * Returns 404 if the lead doesn't exist.
 * Returns 409 if the row isn't in a retry-able state (READY rows
 * have no mission to retry; SHIPPED rows are terminal).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, clearMissionError, getMissionStatus } from "@/lib/db";
import { getAgentBus } from "@/agents/base/agent-bus";
import { initAgents } from "@/agents/bootstrap";

export const runtime = "nodejs";

interface JobRow {
  id: string;
  title: string | null;
  company: string | null;
  url: string | null;
  fit_percentage: number | null;
  ai_analysis: string | null;
  mission_started_at: string | null;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  initAgents();

  const { leadId } = await params;
  if (!leadId) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, title, company, url, fit_percentage, ai_analysis,
              mission_started_at
       FROM seen_jobs WHERE id = ?`
    )
    .get(leadId) as JobRow | undefined;
  if (!row) {
    return NextResponse.json(
      { retried: false, error: "Lead not found", leadId },
      { status: 404 }
    );
  }

  const status = getMissionStatus(leadId);
  if (status !== "IN_PROGRESS" && status !== "KIT_READY") {
    return NextResponse.json(
      {
        retried: false,
        reason: "not_retriable",
        currentStatus: status,
        leadId,
      },
      { status: 409 }
    );
  }

  clearMissionError(leadId);

  let analysis: unknown = null;
  try {
    analysis = row.ai_analysis ? JSON.parse(row.ai_analysis) : null;
  } catch {
    analysis = null;
  }

  try {
    const bus = getAgentBus();
    void bus.publish("mission:started", "system", {
      leadId,
      company: row.company || "Unknown",
      jobTitle: row.title || "Untitled role",
      url: row.url || null,
      fitPercentage: row.fit_percentage ?? null,
      analysis,
      // Re-use the original startedAt so reload-safe countdowns and
      // synthetic rows don't snap back to T+0 on a retry.
      startedAt: row.mission_started_at || new Date().toISOString(),
    });
  } catch (err) {
    console.error("[mission/retry] bus publish failed", err);
  }

  return NextResponse.json({
    retried: true,
    leadId,
    status,
  });
}
