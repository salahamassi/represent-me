/**
 * GET /api/war-room/persona/[role]/metrics
 *
 * Returns the real DB count that drives each persona's bottom metric
 * tile in the workbench. No fabrication — every number maps to a
 * SELECT against the live tables.
 *
 *   Yusuf  — active missions (rows in IN_PROGRESS)
 *   Rashid — leads scouted in the last 7 days
 *   Layla  — cover_letter rows generated in the last 7 days
 *   Ghada  — linkedin_post rows with an image_url in the last 7 days
 *   Kareem — generated_resumes rows in the last 7 days
 *   Tariq  — active missions (he's the enforcement / countdown desk)
 *
 * Returns 400 for an unknown role. Numbers are 0 on a fresh DB —
 * which is the truth.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { asPersonaKey, type WarRoomPersonaKey } from "@/war-room/personas";

export const runtime = "nodejs";
// v3 Plan A — Force dynamic so Next/Turbopack doesn't serve a cached
// response from a prior compile. The DB query is cheap; freshness
// matters more than cacheability.
export const dynamic = "force-dynamic";

interface MetricResponse {
  role: WarRoomPersonaKey;
  label: string;
  value: number;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ role: string }> }
) {
  const { role: roleParam } = await params;
  const role = asPersonaKey(roleParam);
  if (!role) {
    return NextResponse.json(
      { error: `Unknown persona: ${roleParam}` },
      { status: 400 }
    );
  }

  const db = getDb();
  let label = "";
  let value = 0;

  switch (role) {
    case "Yusuf":
    case "Tariq": {
      label = "Active missions";
      value = (db
        .prepare(
          "SELECT COUNT(*) as c FROM seen_jobs WHERE mission_status = 'IN_PROGRESS'"
        )
        .get() as { c: number }).c;
      break;
    }
    case "Rashid": {
      // Label intentionally avoids ending in a digit-letter combo
      // ("7d") because the metric value renders right-adjacent to
      // the label and "7D · 0" reads as "70" at a glance.
      label = "Leads this week";
      value = (db
        .prepare(
          `SELECT COUNT(*) as c FROM seen_jobs
           WHERE first_seen_at >= datetime('now', '-7 days')`
        )
        .get() as { c: number }).c;
      break;
    }
    case "Layla": {
      label = "Cover letters this week";
      value = (db
        .prepare(
          `SELECT COUNT(*) as c FROM generated_content
           WHERE content_type = 'cover_letter'
             AND created_at >= datetime('now', '-7 days')`
        )
        .get() as { c: number }).c;
      break;
    }
    case "Ghada": {
      label = "Visuals this week";
      value = (db
        .prepare(
          `SELECT COUNT(*) as c FROM generated_content
           WHERE image_url IS NOT NULL
             AND created_at >= datetime('now', '-7 days')`
        )
        .get() as { c: number }).c;
      break;
    }
    case "Kareem": {
      label = "CVs tailored this week";
      value = (db
        .prepare(
          `SELECT COUNT(*) as c FROM generated_resumes
           WHERE created_at >= datetime('now', '-7 days')`
        )
        .get() as { c: number }).c;
      break;
    }
  }

  const out: MetricResponse = { role, label, value };
  return NextResponse.json(out);
}

