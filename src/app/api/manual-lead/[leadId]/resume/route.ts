/**
 * GET /api/manual-lead/[leadId]/resume
 *
 * Streams the tailored PDF Amin generated for a manual lead. Returns
 * 404 until the kit is marked `kit-ready` on the DB row — the UI uses
 * that same flag to decide whether to render the Download button, so
 * in practice the user only hits this when the file exists.
 */

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { getManualLead } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { leadId } = await params;
  const row = getManualLead(leadId);
  if (!row) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (row.kit_status !== "kit-ready" || !row.kit_resume_path) {
    return NextResponse.json({ error: "Kit is not ready yet" }, { status: 404 });
  }

  try {
    const pdf = await readFile(row.kit_resume_path);
    const safeCompany = (row.company || "company").replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `SalahNahed_Resume_${safeCompany}.pdf`;
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Failed to read kit file: ${msg}`, path: basename(row.kit_resume_path) },
      { status: 500 }
    );
  }
}
