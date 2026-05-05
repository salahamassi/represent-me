/**
 * GET /api/war-room/lead/[leadId]/resume
 *
 * Returns the latest `generated_resumes` row tagged for this lead
 * (`job_id` join) plus a download URL the workbench can render.
 * Returns `{ resume: null }` when nothing has been generated — that
 * drives the "Queued" state on Kareem's panel.
 */

import { NextRequest, NextResponse } from "next/server";
import { getLeadResume } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { leadId } = await params;
  if (!leadId) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }
  const resume = getLeadResume(leadId);
  if (!resume) {
    return NextResponse.json({ leadId, resume: null });
  }
  return NextResponse.json({
    leadId,
    resume: {
      id: resume.id,
      jobTitle: resume.jobTitle,
      company: resume.company,
      fitPercentage: resume.fitPercentage,
      pdfFilename: resume.pdfFilename,
      // Public download URL — same shape Kareem's CV history list uses.
      downloadUrl: resume.pdfFilename
        ? `/api/jobs/resume?file=${encodeURIComponent(resume.pdfFilename)}`
        : null,
      createdAt: resume.createdAt,
      userAction: resume.userAction,
    },
  });
}
