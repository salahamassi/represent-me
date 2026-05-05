/**
 * GET /api/profile/export?format=pdf|docx
 *
 * Streams the canonical CV (generated fresh from src/data/profile.ts)
 * as either PDF or DOCX. No disk write — the file lives entirely in the
 * response body, so every download reflects the current profile data.
 *
 * The filename uses Salah's name with the format suffix so saving in
 * Chrome's download dialog lands with the right extension by default.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateProfilePDF } from "@/services/profile-pdf-service";
import { generateProfileDOCX } from "@/services/profile-docx-service";
import { profile } from "@/data/profile";

export const runtime = "nodejs";

function safeName(): string {
  return profile.name.replace(/[^a-zA-Z0-9]+/g, "_");
}

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format") || "pdf";
  // ATS mode: 2-page trimmed CV with no avatar + single-column header,
  // safer for Applicant Tracking System parsers. Off by default — the
  // "full" export keeps the rich portfolio view.
  const ats = request.nextUrl.searchParams.get("ats") === "true";
  const suffix = ats ? "_ATS" : "";

  try {
    if (format === "pdf") {
      const buf = await generateProfilePDF({ ats });
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${safeName()}_CV${suffix}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (format === "docx") {
      const buf = await generateProfileDOCX({ ats });
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${safeName()}_CV${suffix}.docx"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json(
      { error: `Unsupported format: ${format}. Use pdf or docx.` },
      { status: 400 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[profile/export]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
