/**
 * GET /api/war-room/agent-activity?role=Yusuf|Rashid|Layla|Kareem&limit=5
 *
 * Returns the most recent activity-log rows attributed to the given
 * persona's underlying backend agent ids. Used by each Generic
 * Workbench's "Recent Logs" terminal-style block so Salah can see
 * what that operator has been doing without leaving the workbench.
 *
 * Persona → backend agent_id map:
 *   Rashid  → job-matcher
 *   Layla   → content
 *   Kareem  → bureaucrat, resume   (audit + ATS-tied resume work)
 *   Yusuf   → system               (synthesis + supervisor activity)
 *
 * Tariq is intentionally not handled — his workbench is a live
 * countdown, not a log feed.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { asPersonaKey, type WarRoomPersonaKey } from "@/war-room/personas";

export const runtime = "nodejs";

export interface AgentLogEntry {
  id: number;
  agentId: string;
  eventType: string;
  title: string;
  /** ISO-ish timestamp from sqlite (`YYYY-MM-DD HH:MM:SS`). */
  createdAt: string;
}

/** Persona → backend agent_id values. Multi-id personas (Kareem) get
 *  a UNION of activity rows across all their backing agents. */
const PERSONA_AGENT_IDS: Record<
  Exclude<WarRoomPersonaKey, "Tariq">,
  string[]
> = {
  Rashid: ["job-matcher"],
  Layla: ["content"],
  Ghada: ["ghada", "ghada-summariser"],
  Kareem: ["bureaucrat", "resume"],
  Yusuf: ["system"],
};

export async function GET(req: NextRequest) {
  const role = req.nextUrl.searchParams.get("role") || "";
  const limitParam = Number(req.nextUrl.searchParams.get("limit") || "5");
  const limit = Math.min(Math.max(limitParam, 1), 50);

  // v3 — `role=all` is the cross-persona seed used by the Floor Plan
  // to hydrate Radio Chatter on page load. Returns the latest rows
  // attributed to ANY persona-mapped agent_id, in newest-first order.
  // The client maps each row's `agentId` back to a persona for display.
  let agentIds: string[];
  let respondingRole: WarRoomPersonaKey | "all";
  if (role === "all") {
    agentIds = Array.from(
      new Set(Object.values(PERSONA_AGENT_IDS).flat())
    );
    respondingRole = "all";
  } else {
    const personaKey = asPersonaKey(role);
    if (!personaKey || personaKey === "Tariq") {
      return NextResponse.json(
        { error: `No activity feed defined for role: ${role}` },
        { status: 400 }
      );
    }
    agentIds = PERSONA_AGENT_IDS[personaKey];
    respondingRole = personaKey;
  }

  const placeholders = agentIds.map(() => "?").join(",");

  const db = getDb();
  // v3 Plan A — Exclude `bus_event` rows. The agent bus auto-logs
  // every publish() call as a bus_event with title "Event: <type>"
  // for debugging. Surfacing those in user-facing chat / "Now Working
  // On" / Recent Logs floods the panel with N copies of the same
  // mission:started row. Real agent work uses logStep() which writes
  // a different event_type (e.g. "layla:mission-start"). Filtering
  // here cleans every downstream consumer in one place.
  const rows = db
    .prepare(
      `SELECT id, agent_id, event_type, title, created_at
       FROM agent_activity_log
       WHERE agent_id IN (${placeholders})
         AND event_type != 'bus_event'
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(...agentIds, limit) as {
    id: number;
    agent_id: string;
    event_type: string;
    title: string;
    created_at: string;
  }[];

  const entries: AgentLogEntry[] = rows.map((r) => ({
    id: r.id,
    agentId: r.agent_id,
    eventType: r.event_type,
    title: r.title,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ role: respondingRole, entries });
}
