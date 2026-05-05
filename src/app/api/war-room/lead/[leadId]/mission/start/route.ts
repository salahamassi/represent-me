/**
 * POST /api/war-room/lead/[leadId]/mission/start
 *
 * Real-DB transition that backs the War Room "Trigger apply chain"
 * button. Replaces the prior UI-only `activeMissions` localStorage
 * state machine with a row in `seen_jobs.mission_status`.
 *
 * Behaviour:
 *   - 200 + `{ started: true, startedAt }` if the row was READY (or
 *     legacy NULL) — flips it to IN_PROGRESS and stamps the start time.
 *   - 409 + `{ started: false, currentStatus }` if the row was already
 *     past READY (someone fired it from another tab, or it's KIT_READY/
 *     SHIPPED). The client uses this to reconcile its UI without showing
 *     an error to the user.
 *   - 404 if the leadId doesn't exist.
 *
 * Idempotency is enforced in `db.startMission` via a conditional
 * UPDATE — concurrent triggers from two tabs serialize and only the
 * first matches.
 *
 * Out of scope for this pass: KIT_READY / SHIPPED transitions. Those
 * land via separate routes once the SLA-elapsed auto-advancer or a
 * "Mark shipped" button is wired.
 */

import { NextRequest, NextResponse } from "next/server";
import { startMission, getDb } from "@/lib/db";
import { getAgentBus } from "@/agents/base/agent-bus";
import { initAgents } from "@/agents/bootstrap";

export const runtime = "nodejs";

interface JobLite {
  id: string;
  title: string | null;
  company: string | null;
  url: string | null;
  fit_percentage: number | null;
  ai_analysis: string | null;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  // Make sure agent subscribers are attached on this Next.js process —
  // mission:started would land in a void otherwise.
  initAgents();

  const { leadId } = await params;
  if (!leadId) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  const result = startMission(leadId);
  if (result.started) {
    // v3 Plan A Phase 3 — Publish mission:started so the content +
    // bureaucrat agents can subscribe and produce real artefacts.
    // Pull the row's title/company/etc once so subscribers don't
    // each re-query for the same fields.
    try {
      const db = getDb();
      const job = db
        .prepare(
          `SELECT id, title, company, url, fit_percentage, ai_analysis
           FROM seen_jobs WHERE id = ?`
        )
        .get(leadId) as JobLite | undefined;
      let analysis: unknown = null;
      try {
        analysis = job?.ai_analysis ? JSON.parse(job.ai_analysis) : null;
      } catch {
        analysis = null;
      }
      const bus = getAgentBus();
      // Fire-and-forget; subscribers run async, the route returns now.
      void bus.publish("mission:started", "system", {
        leadId,
        company: job?.company || "Unknown",
        jobTitle: job?.title || "Untitled role",
        url: job?.url || null,
        fitPercentage: job?.fit_percentage ?? null,
        analysis,
        startedAt: result.startedAt,
      });
    } catch (err) {
      // Bus failure shouldn't block the route's success — the DB
      // transition already happened. Log and move on.
      console.error("[mission/start] bus publish failed", err);
    }

    return NextResponse.json({
      started: true,
      leadId,
      startedAt: result.startedAt,
      status: "IN_PROGRESS",
    });
  }

  if (result.reason === "not_found") {
    return NextResponse.json(
      { started: false, error: "Lead not found", leadId },
      { status: 404 }
    );
  }

  // not_ready — the row exists but is past READY. Tell the client what
  // state it's actually in so it can update the button without showing
  // an error.
  return NextResponse.json(
    {
      started: false,
      reason: "not_ready",
      currentStatus: result.currentStatus,
      leadId,
    },
    { status: 409 }
  );
}
