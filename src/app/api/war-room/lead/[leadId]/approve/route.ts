/**
 * POST /api/war-room/lead/[leadId]/approve
 *
 * Mandatory approval gate handoff. Salah clicks "Approve Mission" on
 * the Command Bar; this endpoint:
 *
 *   1. Sets `seen_jobs.approval_status = 'approved'` for the row.
 *   2. Re-publishes the chain entry-point event so the gated
 *      subscribers (Layla, Amin / Resume, Kareem / Bureaucrat) wake up
 *      and run for real this time.
 *   3. Logs `lead:approved` activity so the chatter feed records it.
 *
 * For manual leads the entry-point event is `manual-lead:analyzed` —
 * Saqr already published this once when the lead came in, but the
 * downstream agents bailed because the lead was pending. We re-publish
 * with the same payload (reconstructed from the DB row + the prior
 * Saqr analysis stored on `ai_analysis`) so they fire now.
 *
 * For scouted jobs the entry-point is `job:high-fit`. Same idea.
 *
 * Idempotent — calling this on an already-approved lead is a no-op
 * (returns ok with `alreadyApproved: true`). Doesn't re-trigger the
 * chain to avoid double Claude bills.
 */

import { NextResponse } from "next/server";
import {
  getDb,
  setLeadApprovalStatus,
  getManualLead,
  logActivity,
  startMission,
} from "@/lib/db";
import { getAgentBus } from "@/agents/base/agent-bus";
import { initAgents } from "@/agents/bootstrap";

export const runtime = "nodejs";

interface SeenJobRow {
  id: string;
  source: string | null;
  title: string | null;
  company: string | null;
  url: string | null;
  fit_percentage: number | null;
  approval_status: string | null;
  ai_analysis: string | null;
  jd_text: string | null;
  contact_name: string | null;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ leadId: string }> }
) {
  // Make sure agent subscribers are attached on this Next.js process —
  // republished events would land in a void otherwise.
  initAgents();

  const { leadId } = await params;
  if (!leadId) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, source, title, company, url, fit_percentage,
              approval_status, ai_analysis, jd_text, contact_name
       FROM seen_jobs
       WHERE id = ?`
    )
    .get(leadId) as SeenJobRow | undefined;

  if (!row) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (row.approval_status === "approved") {
    // Already gated, but the mission may still be READY (e.g. legacy
    // approved rows from before Plan A landed). Try to advance the
    // state machine; idempotent — returns `not_ready` if it's already
    // IN_PROGRESS or beyond.
    const lateStart = startMission(leadId);
    return NextResponse.json({
      ok: true,
      leadId,
      alreadyApproved: true,
      kitChainTriggered: false,
      missionStarted: lateStart.started,
      missionStatus: lateStart.started ? "IN_PROGRESS" : lateStart.currentStatus,
    });
  }

  // Flip the gate first. Republished events check the DB before doing
  // work, so the order matters — flip then publish.
  setLeadApprovalStatus(leadId, "approved");

  // Bus is shared across the rest of the route — pulled here so the
  // mission:started publish below has access. The original `kitChain`
  // republish further down also uses it.
  const bus = getAgentBus();

  // v3 Plan A unification — Approve and Trigger Apply Chain are now
  // the same action. The mission state machine (READY → IN_PROGRESS)
  // advances HERE so a single click on Approve also locks the lead
  // detail's Trigger button and surfaces the lead in the active-
  // missions polling endpoint. Idempotent: if the row is already
  // IN_PROGRESS (e.g. the user clicked Trigger first, then Approve)
  // startMission returns `not_ready` and we move on.
  const missionResult = startMission(leadId);

  // v3 Plan A Phase 3 — Publish mission:started when the row actually
  // transitioned. Fires real agent work via subscribers (content +
  // bureaucrat). For scouted jobs the existing `job:high-fit`
  // republish below ALSO drives content drafts (social posts);
  // mission:started is the lead-scoped equivalent that produces a
  // cover letter saved with `related_lead_id`. Different content_types,
  // both useful, no duplication.
  if (missionResult.started) {
    try {
      void bus.publish("mission:started", "system", {
        leadId,
        company: row.company || "Unknown",
        jobTitle: row.title || "Untitled role",
        url: row.url || null,
        fitPercentage: row.fit_percentage ?? null,
        analysis: row.ai_analysis ? JSON.parse(row.ai_analysis) : null,
        startedAt: missionResult.startedAt,
      });
    } catch (err) {
      console.error("[approve] mission:started publish failed", err);
    }
  }
  // We don't fail the approve call if startMission was a no-op —
  // the gate flip is the user-meaningful contract; the mission
  // transition is best-effort idempotent.

  // Log the approval as a chatter-friendly activity row. The web UI's
  // SSE bridge surfaces this to the activity log immediately.
  try {
    logActivity({
      agentId: "system",
      eventType: "lead:approved",
      title: `Mission approved · ${row.company || "lead"}`,
      detail: JSON.stringify({
        leadId,
        company: row.company,
        source: row.source,
        approvedAt: new Date().toISOString(),
      }),
    });
  } catch {
    // Logging failure shouldn't block the chain trigger.
  }

  let kitChainTriggered = false;

  if (row.source === "manual-lead") {
    // Re-publish the manual-lead chain entry. The Saqr analysis is
    // stored on the row from the original submission — we hand it
    // back to the bus so Layla and Amin can pick it up.
    const manual = getManualLead(leadId);
    let analysis: unknown = null;
    try {
      analysis = manual?.ai_analysis
        ? JSON.parse(manual.ai_analysis)
        : null;
    } catch {
      analysis = null;
    }

    if (!analysis) {
      // Saqr hasn't finished analysing yet — rare, but possible if
      // Salah hits Approve very quickly. We still flipped the gate
      // (which is what matters), but we can't kick the downstream
      // agents until the analysis lands. They'll get the original
      // (now-no-longer-gated) `manual-lead:analyzed` event when Saqr
      // publishes it.
      return NextResponse.json({
        ok: true,
        leadId,
        kitChainTriggered: false,
        note: "Approved, but Saqr's analysis isn't ready yet. Chain will fire automatically when his pass completes.",
      });
    }

    await bus.publish("manual-lead:analyzed", "system", {
      leadId,
      jdText: manual?.jd_text || row.jd_text || "",
      url: manual?.url || row.url || null,
      jobTitle: manual?.title || row.title || "Pending title",
      company: manual?.company || row.company || "Pending company",
      contactName: manual?.contact_name || row.contact_name || null,
      fitPercentage:
        manual?.fit_percentage ??
        row.fit_percentage ??
        (analysis as { fitPercentage?: number }).fitPercentage ??
        0,
      analysis,
    });
    kitChainTriggered = true;
  } else {
    // Scouted job — re-publish job:high-fit with the data we have.
    // The original published payload may be lost (in-memory bus event
    // log only keeps the last 200), so we reconstruct from DB.
    let analysis: unknown = null;
    try {
      analysis = row.ai_analysis ? JSON.parse(row.ai_analysis) : null;
    } catch {
      analysis = null;
    }
    if (!analysis) {
      return NextResponse.json({
        ok: true,
        leadId,
        kitChainTriggered: false,
        note: "Approved, but no ai_analysis on this row — re-fetch the job to fill it before the kit can be generated.",
      });
    }
    await bus.publish("job:high-fit", "system", {
      jobId: leadId,
      jobTitle: row.title || "Untitled role",
      company: row.company || "Unknown",
      url: row.url || "",
      fitPercentage: row.fit_percentage ?? 0,
      analysis,
    });
    kitChainTriggered = true;
  }

  return NextResponse.json({
    ok: true,
    leadId,
    company: row.company,
    fitPercentage: row.fit_percentage,
    kitChainTriggered,
    // v3 — Mission state info so the Command Bar can update the
    // floor-plan's activeMissions optimistically without waiting for
    // the next 10-second poll.
    missionStarted: missionResult.started,
    missionStatus: missionResult.started
      ? "IN_PROGRESS"
      : missionResult.currentStatus,
  });
}
