/**
 * PATCH /api/jobs/kit
 *
 * Persists the Bulk Reviewer modal's inline edits. Salah's textarea
 * fires this on a debounced cadence (~600ms after the last keystroke)
 * so a 10-second perfecting pass on a bullet point survives a reload.
 *
 * Request body:
 *   {
 *     jobId: string,
 *     coverLetter?: string,
 *     tailoredSummary?: string,
 *     resumeBullets?: string[],
 *   }
 *
 * Only the fields actually present are written — concurrent saves on
 * different fields don't clobber each other. Returns 404 if no kit
 * row exists yet for this job (i.e. Bulk Generate hasn't run).
 */

import { NextRequest, NextResponse } from "next/server";
import { updateJobKit } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest) {
  let body: {
    jobId?: unknown;
    coverLetter?: unknown;
    tailoredSummary?: unknown;
    resumeBullets?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.jobId !== "string" || !body.jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  const fields: { coverLetter?: string; tailoredSummary?: string; resumeBullets?: string[] } = {};
  if (body.coverLetter !== undefined) {
    if (typeof body.coverLetter !== "string") {
      return NextResponse.json({ error: "coverLetter must be a string" }, { status: 400 });
    }
    fields.coverLetter = body.coverLetter;
  }
  if (body.tailoredSummary !== undefined) {
    if (typeof body.tailoredSummary !== "string") {
      return NextResponse.json({ error: "tailoredSummary must be a string" }, { status: 400 });
    }
    fields.tailoredSummary = body.tailoredSummary;
  }
  if (body.resumeBullets !== undefined) {
    if (
      !Array.isArray(body.resumeBullets) ||
      !body.resumeBullets.every((s) => typeof s === "string")
    ) {
      return NextResponse.json(
        { error: "resumeBullets must be an array of strings" },
        { status: 400 }
      );
    }
    fields.resumeBullets = body.resumeBullets as string[];
  }

  if (Object.keys(fields).length === 0) {
    return NextResponse.json(
      { error: "Provide at least one of: coverLetter, tailoredSummary, resumeBullets" },
      { status: 400 }
    );
  }

  const updated = updateJobKit(body.jobId, fields);
  if (!updated) {
    return NextResponse.json(
      { error: "No kit found for this job — run Generate first." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, jobId: body.jobId, fields: Object.keys(fields) });
}
