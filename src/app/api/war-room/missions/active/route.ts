/**
 * GET /api/war-room/missions/active
 *
 * Lists every lead currently IN_PROGRESS. Polled by the War Room
 * floor-plan (10 s cadence) to drive:
 *   - The MISSION ACTIVE button state on LeadDetailPanel
 *   - Synthetic "live work" rows in Layla / Kareem workbenches
 *   - The progress-phase chatter ticker
 *
 * v3 Plan A — DB is the source of truth. The client no longer
 * persists mission state to localStorage; this endpoint replaces
 * that. Reload-safe by construction: the row exists in SQLite, so
 * any tab that polls sees the same active set.
 *
 * Out of scope: KIT_READY and SHIPPED rows. Those are post-mission
 * states the floor doesn't animate. They show up elsewhere (lead
 * detail, history) but not on this endpoint.
 */

import { NextResponse } from "next/server";
import { getActiveMissions } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const missions = getActiveMissions();
  return NextResponse.json({ missions });
}
