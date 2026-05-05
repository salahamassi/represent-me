/**
 * Integration test for the unified mission flow (Phases 1–5).
 *
 * Run:
 *   npx tsx --test tests/mission-flow.integration.test.ts
 *
 * What this proves end-to-end (without spending Claude money):
 *
 *   1. Publishing `mission:started` to the bus triggers the
 *      content-ai-agent's subscriber.
 *   2. The subscriber writes a `generated_content` row tagged with
 *      `related_lead_id` matching the published leadId.
 *   3. `getLeadContent(leadId)` returns that row immediately after.
 *   4. A second `mission:started` for the SAME lead (idempotency
 *      check) writes a second row — the agent is stateless; we don't
 *      gate on prior writes. The state-machine itself prevents
 *      double-fires upstream (tested in state-machine.test.ts).
 *
 * Mocking strategy:
 *   - The Claude call is on `ContentAIAgent.prototype["callClaudeRaw"]`.
 *     We monkey-patch that method to return a fixed stub string before
 *     `initAgents()` runs. The rest of the handler — logging,
 *     saveLeadContent, bus republish — runs unmodified, so the bus
 *     plumbing and DB write are real.
 *   - Anthropic API key is unset; the mock makes that irrelevant.
 *
 * What this does NOT prove:
 *   - That Claude actually returns useful copy. That requires a manual
 *     smoke run against the dev server (curl runbook at the bottom of
 *     this file).
 *   - That the Next.js route handler attaches subscribers correctly
 *     under HMR. The bootstrap is idempotent; `initAgents()` either
 *     works or it doesn't, no middle ground.
 *
 * MANUAL SMOKE RUNBOOK (run against `npm run dev`, costs ~$0.005):
 *
 *   # 1. Pick a real seen_jobs row (or insert a fake one).
 *   sqlite3 ./data/represent-me.db "SELECT id, company FROM seen_jobs LIMIT 5;"
 *
 *   # 2. Trigger the mission:
 *   curl -X POST http://localhost:3000/api/war-room/lead/<id>/mission/start
 *
 *   # 3. Verify mission_status flipped:
 *   sqlite3 ./data/represent-me.db \
 *     "SELECT id, mission_status, mission_started_at FROM seen_jobs WHERE id = '<id>';"
 *
 *   # 4. Wait ~10 seconds for Claude to draft, then check the row:
 *   curl http://localhost:3000/api/war-room/lead/<id>/content
 *
 *   # 5. The response should include a real generated_text containing
 *   #    a cover letter referencing the company name. If it returns
 *   #    `{"content": null}` after 30 seconds, check the worker logs
 *   #    for `[Layla] Cover letter draft failed:`.
 */

import { test, after, before } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const TEST_DIR = mkdtempSync(path.join(tmpdir(), "warroom-mission-flow-"));
const TEST_DB = path.join(TEST_DIR, "test.db");
process.env.WARROOM_DB_PATH = TEST_DB;
// Defensive — don't accidentally hit real Claude even if the mock fails.
process.env.ANTHROPIC_API_KEY = "test-stub-no-real-key";

// Imports happen AFTER the env is set so db.ts and agents read the
// right paths.
import { getDb, getLeadContent, getMissionStatus } from "../src/lib/db";
import { initAgents } from "../src/agents/bootstrap";
import { getAgentBus } from "../src/agents/base/agent-bus";
import { ContentAIAgent } from "../src/agents/ai/content-ai-agent";
import { ResumeAIAgent } from "../src/agents/ai/resume-ai-agent";

// ---------------------------------------------------------------------
// Mock the Claude call — runs BEFORE initAgents() so the patched method
// is what subscribers reference. Prototype patching is the smallest
// possible surface change; the rest of the handler runs unmodified.
// ---------------------------------------------------------------------
const STUB_COVER_LETTER =
  "Dear Polaris team — I shipped Trivia and the Bond framework (100+ stars on GitHub). " +
  "Looking to bring that same end-to-end mobile leadership to your Senior iOS role. " +
  "Quick chat next week?";
const originalCallClaude =
  // @ts-expect-error — accessing private method for patching
  ContentAIAgent.prototype.callClaudeRaw;
// @ts-expect-error — patching private method for test
ContentAIAgent.prototype.callClaudeRaw = async function () {
  return STUB_COVER_LETTER;
};

// Kareem (resume agent) — patch generateForJob to write a fake row to
// generated_resumes WITHOUT calling Claude or generating a real PDF.
// We just need a row to exist so getLeadResume returns something and
// the auto-advance helper sees both artefacts present.
const originalGenerateForJob = ResumeAIAgent.prototype.generateForJob;
// Patching the public method for test isolation. We just need a row
// in generated_resumes; the real return shape isn't consumed here.
ResumeAIAgent.prototype.generateForJob = (async function (req: {
  jobId: string;
  jobTitle: string;
  company: string;
}) {
  const { insertGeneratedResume } = await import("../src/lib/db");
  const pdfPath = `/tmp/fake-resume-${req.jobId}.pdf`;
  insertGeneratedResume({
    jobId: req.jobId,
    jobTitle: req.jobTitle,
    company: req.company,
    fitPercentage: 90,
    pdfPath,
    aiAnalysis: "{}",
    resumeData: "{}",
  });
  return { pdfPath, resumeData: {} };
}) as unknown as typeof ResumeAIAgent.prototype.generateForJob;

before(() => {
  getDb();
  // Materialise subscribers — Layla's `mission:started` handler
  // attaches to the bus during the agent's constructor.
  initAgents();
});

after(() => {
  // Restore the real Claude / PDF callables so re-running tests in
  // the same process (rare) doesn't leak the patches.
  // @ts-expect-error — patching private method
  ContentAIAgent.prototype.callClaudeRaw = originalCallClaude;
  ResumeAIAgent.prototype.generateForJob = originalGenerateForJob;
  try {
    getDb().close();
  } catch {
    // ignore
  }
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  delete process.env.WARROOM_DB_PATH;
  delete process.env.ANTHROPIC_API_KEY;
});

function insertFakeJob(id: string, company: string): string {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO seen_jobs (id, source, title, company, fit_percentage)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, "test", "Senior iOS Engineer", company, 92);
  return id;
}

// ---------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------

test("mission:started with full analysis → Layla + Kareem both write, auto-advances to KIT_READY", async () => {
  const { getLeadResume, getMissionStatus, startMission } = await import(
    "../src/lib/db"
  );
  const db = getDb();
  db.prepare("DELETE FROM seen_jobs").run();
  db.prepare("DELETE FROM generated_content").run();
  db.prepare("DELETE FROM generated_resumes").run();

  insertFakeJob("flow-polaris", "Polaris Labs");
  startMission("flow-polaris");

  // Pre-condition: no artefacts for this lead yet.
  assert.equal(getLeadContent("flow-polaris"), null);
  assert.equal(getLeadResume("flow-polaris"), null);

  const bus = getAgentBus();
  await bus.publish("mission:started", "system", {
    leadId: "flow-polaris",
    company: "Polaris Labs",
    jobTitle: "Senior iOS Engineer",
    url: null,
    fitPercentage: 92,
    analysis: {
      matchedSkills: [
        { skill: "Swift", evidence: "5+ years iOS at WiNCH/ITG" },
        { skill: "SwiftUI", evidence: "WiNCH + Nologystore" },
      ],
      missingSkills: ["gRPC"],
    },
    startedAt: new Date().toISOString(),
  });

  // Layla wrote the cover letter.
  const content = getLeadContent("flow-polaris");
  assert.ok(content, "Layla should have written a cover_letter row");
  assert.equal(content!.contentType, "cover_letter");
  assert.equal(content!.generatedText, STUB_COVER_LETTER);

  // Kareem wrote the resume (stubbed PDF path).
  const resume = getLeadResume("flow-polaris");
  assert.ok(resume, "Kareem should have written a generated_resumes row");
  assert.equal(resume!.jobTitle, "Senior iOS Engineer");
  assert.equal(resume!.company, "Polaris Labs");

  // Both done → mission auto-advanced to KIT_READY.
  assert.equal(getMissionStatus("flow-polaris"), "KIT_READY");
});

test("mission:started with NULL analysis → Layla writes, Kareem skips, mission stays IN_PROGRESS", async () => {
  // Documents the half-completion behaviour: Kareem requires
  // ai_analysis on the row to tailor the CV. Without it he logs and
  // returns. The mission stays IN_PROGRESS (not auto-advanced),
  // which is correct — KIT_READY without a tailored CV would lie.
  const { getLeadResume, getMissionStatus, startMission } = await import(
    "../src/lib/db"
  );
  const db = getDb();
  db.prepare("DELETE FROM seen_jobs").run();
  db.prepare("DELETE FROM generated_content").run();
  db.prepare("DELETE FROM generated_resumes").run();

  insertFakeJob("flow-no-analysis", "Sirius");
  startMission("flow-no-analysis");

  const bus = getAgentBus();
  await bus.publish("mission:started", "system", {
    leadId: "flow-no-analysis",
    company: "Sirius",
    jobTitle: "Lead Mobile",
    url: null,
    fitPercentage: 87,
    analysis: null,
    startedAt: new Date().toISOString(),
  });

  // Layla still ran (she doesn't gate on analysis).
  assert.ok(getLeadContent("flow-no-analysis"));
  // Kareem skipped — no resume row.
  assert.equal(getLeadResume("flow-no-analysis"), null);
  // Mission did NOT auto-advance.
  assert.equal(getMissionStatus("flow-no-analysis"), "IN_PROGRESS");
});

test("mission:started fires bus events for chatter (start + ready)", async () => {
  const db = getDb();
  db.prepare("DELETE FROM seen_jobs").run();
  db.prepare("DELETE FROM generated_content").run();
  insertFakeJob("flow-helios", "Helios");

  const bus = getAgentBus();
  const observed: string[] = [];
  // Wire ad-hoc spies for the events the agent should publish during
  // the run. We unsubscribe at the end so the spies don't leak across
  // test cases.
  const off1 = bus.subscribe("content:cover-letter-start", () => {
    observed.push("start");
  });
  const off2 = bus.subscribe("content:cover-letter-ready", () => {
    observed.push("ready");
  });

  try {
    await bus.publish("mission:started", "system", {
      leadId: "flow-helios",
      company: "Helios",
      jobTitle: "Lead Flutter Engineer",
      url: null,
      fitPercentage: 88,
      analysis: null,
      startedAt: new Date().toISOString(),
    });
  } finally {
    off1();
    off2();
  }

  assert.deepEqual(
    observed,
    ["start", "ready"],
    "Layla should publish start then ready events for the SSE bridge"
  );
});

test("auto-advance is composite — last-finishing agent flips to KIT_READY", async () => {
  const { startMission } = await import("../src/lib/db");
  const db = getDb();
  db.prepare("DELETE FROM seen_jobs").run();
  db.prepare("DELETE FROM generated_content").run();
  db.prepare("DELETE FROM generated_resumes").run();
  insertFakeJob("flow-kit-ready", "Cygnus");

  startMission("flow-kit-ready");
  assert.equal(getMissionStatus("flow-kit-ready"), "IN_PROGRESS");

  const bus = getAgentBus();
  await bus.publish("mission:started", "system", {
    leadId: "flow-kit-ready",
    company: "Cygnus",
    jobTitle: "Senior iOS Engineer",
    url: null,
    fitPercentage: 91,
    analysis: { matchedSkills: [{ skill: "Swift" }], missingSkills: [] },
    startedAt: new Date().toISOString(),
  });

  // Both agents ran in parallel via bus.publish's Promise.all; the
  // last to finish flipped KIT_READY.
  assert.equal(getMissionStatus("flow-kit-ready"), "KIT_READY");

  // Row dropped from active set.
  const { getActiveMissions } = await import("../src/lib/db");
  assert.equal(
    getActiveMissions().find((m) => m.leadId === "flow-kit-ready"),
    undefined
  );
});

test("Layla failure → mission_error recorded → retry clears it (Phase F)", async () => {
  const { getMissionError, clearMissionError } = await import(
    "../src/lib/db"
  );
  const db = getDb();
  db.prepare("DELETE FROM seen_jobs").run();
  db.prepare("DELETE FROM generated_content").run();
  db.prepare("DELETE FROM generated_resumes").run();
  insertFakeJob("err-flow", "Pulsar Labs");

  // Patch Layla's Claude call to throw THIS test only, then restore.
  // Patches are restored in finally so subsequent tests aren't affected.
  // @ts-expect-error — accessing private method
  const restoreClaude = ContentAIAgent.prototype.callClaudeRaw;
  // @ts-expect-error — patching for test
  ContentAIAgent.prototype.callClaudeRaw = async function () {
    throw new Error("simulated Anthropic 529 overload");
  };

  try {
    const bus = getAgentBus();
    await bus.publish("mission:started", "system", {
      leadId: "err-flow",
      company: "Pulsar Labs",
      jobTitle: "Senior iOS Engineer",
      url: null,
      fitPercentage: 89,
      analysis: { matchedSkills: [{ skill: "Swift" }], missingSkills: [] },
      startedAt: new Date().toISOString(),
    });

    // Layla's catch block should have recorded the error.
    const err = getMissionError("err-flow");
    assert.ok(err, "expected mission_error after Layla threw");
    assert.match(err!.message, /^layla:/);
    assert.match(err!.message, /529/);
    // Clearing manually proves the helper works (the route does this
    // before re-publishing on retry).
    clearMissionError("err-flow");
    assert.equal(getMissionError("err-flow"), null);
  } finally {
    // @ts-expect-error — restoring stub
    ContentAIAgent.prototype.callClaudeRaw = restoreClaude;
  }
});

test("end-to-end mission flow: state-machine + both agents + KIT_READY", async () => {
  // Combined test: simulates what the route handler does (DB transition
  // + bus publish), then verifies the workbench-side queries return
  // what the UI expects post-completion.
  const { startMission, getLeadResume } = await import("../src/lib/db");
  const db = getDb();
  db.prepare("DELETE FROM seen_jobs").run();
  db.prepare("DELETE FROM generated_content").run();
  db.prepare("DELETE FROM generated_resumes").run();
  insertFakeJob("flow-end-to-end", "Andromeda");

  const result = startMission("flow-end-to-end");
  assert.equal(result.started, true);
  assert.equal(getMissionStatus("flow-end-to-end"), "IN_PROGRESS");

  const bus = getAgentBus();
  await bus.publish("mission:started", "system", {
    leadId: "flow-end-to-end",
    company: "Andromeda",
    jobTitle: "Mobile Lead",
    url: null,
    fitPercentage: 95,
    analysis: { matchedSkills: [{ skill: "Flutter" }], missingSkills: [] },
    startedAt: result.started ? result.startedAt : new Date().toISOString(),
  });

  // Cover letter row exists.
  const content = getLeadContent("flow-end-to-end");
  assert.ok(content);
  assert.equal(content!.contentType, "cover_letter");

  // Resume row exists.
  const resume = getLeadResume("flow-end-to-end");
  assert.ok(resume);
  assert.equal(resume!.company, "Andromeda");

  // Mission auto-advanced to KIT_READY.
  assert.equal(getMissionStatus("flow-end-to-end"), "KIT_READY");
  const { getActiveMissions } = await import("../src/lib/db");
  assert.equal(
    getActiveMissions().find((m) => m.leadId === "flow-end-to-end"),
    undefined
  );
});
