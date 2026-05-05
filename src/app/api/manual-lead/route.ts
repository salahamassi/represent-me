/**
 * POST /api/manual-lead
 *
 * Salah pastes a JD (optionally with URL / company / title / contact) and
 * this endpoint kicks off the Obeida Workflow consultation chain:
 *
 *   1. Persist a `seen_jobs` row with `source = 'manual-lead'`.
 *   2. Publish `manual-lead:submitted` on the agent bus.
 *   3. Saqr subscribes → analyzes the JD, extracts 3 Key Success Factors,
 *      publishes `manual-lead:analyzed`.
 *   4. Qalam subscribes → writes the warm "vibe check" chat message +
 *      a recommendation-request draft, publishes `manual-lead:qalam-brief-ready`.
 *   5. Amin subscribes → generates tailored resume PDF + cover letter,
 *      publishes `manual-lead:kit-ready` with file paths.
 *
 * This route just fires step 1+2. The chain from there is agent-driven.
 *
 * Returns `{ leadId }` so the UI can poll / subscribe to chain events.
 */

import { NextRequest, NextResponse } from "next/server";
import { insertManualLead } from "@/lib/db";
import { getAgentBus } from "@/agents/base/agent-bus";
import { initAgents } from "@/agents/bootstrap";

export const runtime = "nodejs";

interface Body {
  jdText?: string;
  url?: string;
  company?: string;
  jobTitle?: string;
  contactName?: string;
  referralContext?: string;
}

export async function POST(request: NextRequest) {
  initAgents();

  const body = (await request.json().catch(() => ({}))) as Body;
  const jdText = (body.jdText || "").trim();

  if (!jdText || jdText.length < 40) {
    return NextResponse.json(
      { error: "JD text is required (min 40 chars). Paste the full job description." },
      { status: 400 }
    );
  }

  // Stable id the chain can reference. Using a timestamp prefix keeps
  // it sortable in the DB without pulling in a uuid lib.
  const leadId = `manual-lead-${Date.now()}`;

  // Initial title/company — best-effort. If the user didn't provide them,
  // we store "Pending" and Saqr's analysis will overwrite once it runs.
  const title = body.jobTitle?.trim() || "Pending title";
  const company = body.company?.trim() || "Pending company";

  // Build the referral context string that Qalam will inject into drafts.
  // If contactName is "Obeida" (case-insensitive), append the static
  // teacher/student history per the PM brief.
  let referralContext = body.referralContext?.trim() || "";
  const contactName = body.contactName?.trim() || "";
  if (contactName.toLowerCase().includes("obeida")) {
    const obeidaNote = "Obeida was Salah's student 5 years ago. He is now reaching out with this lead — lean into the teacher→mentor dynamic: warm, proud, specific to Salah's influence on him.";
    referralContext = referralContext ? `${referralContext}\n${obeidaNote}` : obeidaNote;
  }

  insertManualLead({
    id: leadId,
    title,
    company,
    url: body.url,
    jdText,
    contactName: contactName || undefined,
    referralContext: referralContext || undefined,
  });

  // Fan out the chain. The bus publish is fire-and-forget — subscribers
  // run asynchronously, each publishing their own follow-up events.
  const bus = getAgentBus();
  await bus.publish("manual-lead:submitted", "system", {
    leadId,
    jdText,
    url: body.url || null,
    jobTitle: title,
    company,
    contactName: contactName || null,
    referralContext: referralContext || null,
  });

  return NextResponse.json({
    ok: true,
    leadId,
    note: "Chain fired. Saqr → Qalam → Amin are on it.",
  });
}
