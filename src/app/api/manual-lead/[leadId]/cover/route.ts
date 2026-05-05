/**
 * GET /api/manual-lead/[leadId]/cover
 *
 * Returns Amin's generated cover letter. Default is markdown / plain
 * text; pass `?format=txt` (default) to download as a file, or
 * `?format=json` for a JSON envelope with the text in a field — useful
 * for a "copy to clipboard" UI.
 */

import { NextResponse } from "next/server";
import { getManualLead } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { leadId } = await params;
  const row = getManualLead(leadId);
  if (!row) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (!row.cover_letter_text) {
    return NextResponse.json({ error: "Cover letter not ready yet" }, { status: 404 });
  }

  const url = new URL(req.url);
  if (url.searchParams.get("format") === "json") {
    return NextResponse.json({ leadId, text: row.cover_letter_text });
  }

  const safeCompany = (row.company || "company").replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `SalahNahed_CoverLetter_${safeCompany}.md`;
  return new NextResponse(row.cover_letter_text, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
