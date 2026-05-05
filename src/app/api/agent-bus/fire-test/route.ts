/**
 * DEV-ONLY: POST /api/agent-bus/fire-test
 *
 * Publishes a synthetic `job:high-fit` event on the Next.js-process
 * bus so we can verify the Phase 3 collaboration chain end-to-end
 * without spinning up a full Job Matcher run (slow + Claude cost).
 *
 * Removes any hard dependency on the agents map — it imports the
 * getAgents() helper so the subscribers are eagerly instantiated
 * before we publish, otherwise the event fires into a void.
 *
 * Intended for local iteration; feel free to delete this file once
 * Phase 3 is wired and you've confirmed the chain fires for real via
 * /api/automation/run.
 */

import { NextResponse } from "next/server";
import { getAgentBus } from "@/agents/base/agent-bus";
import { initAgents } from "@/agents/bootstrap";

export const runtime = "nodejs";

export async function POST() {
  initAgents();
  const bus = getAgentBus();

  const payload = {
    jobId: `synthetic-${Date.now()}`,
    jobTitle: "Senior Mobile Engineer",
    company: "TestCo",
    url: "https://example.com/jobs/testco-senior-mobile",
    fitPercentage: 92,
    analysis: {
      fitPercentage: 92,
      reasoning: "Synthetic event for chain-test.",
      matchedSkills: [
        { skill: "Flutter", evidence: "5+ years" },
        { skill: "Swift", evidence: "7+ years" },
        { skill: "SwiftUI", evidence: "Production apps" },
        { skill: "iOS architecture", evidence: "Clean arch + MVVM" },
      ],
      transferableSkills: [
        { required: "Kotlin", transferFrom: "Swift", confidence: "medium" as const },
      ],
      missingSkills: ["Docker", "Kubernetes"],
      resumeEmphasis: ["Flutter Bond framework", "WiNCH stability work"],
      applicationTips: "Lead with Flutter Bond and the 90% stability story.",
    },
  };

  await bus.publish("job:high-fit", "job-matcher", payload);

  return NextResponse.json({
    ok: true,
    jobId: payload.jobId,
    note:
      "Chain fired. Watch the Chatter Feed for Resume + Ghostwriter + Bureaucrat events.",
  });
}
