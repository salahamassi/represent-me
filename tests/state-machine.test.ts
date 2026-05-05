/**
 * State-machine test for the War Room mission lifecycle (Plan A).
 *
 * Run:
 *   npx tsx --test tests/state-machine.test.ts
 *
 * What this proves:
 *   1. A fresh row in seen_jobs has effective status READY
 *      (NULL legacy column treated as READY).
 *   2. startMission(leadId) flips READY → IN_PROGRESS atomically and
 *      stamps mission_started_at.
 *   3. A second startMission(leadId) call returns
 *      { started: false, reason: "not_ready" } — the conditional
 *      UPDATE prevents the chain from re-firing for the same lead.
 *      THIS IS THE KEY ASSERTION against the "agents keep re-triggering
 *      START sequence" bug Salah reported.
 *   4. getActiveMissions() includes IN_PROGRESS rows and ONLY those.
 *   5. setMissionStatus(leadId, "KIT_READY") removes the row from the
 *      active set (proving cleanup works without manual deletion).
 *   6. The progress-milestone math is per-tag idempotent.
 *   7. PROGRESS_LINES has copy for every milestone the ticker walks.
 *
 * DB isolation: WARROOM_DB_PATH is set to a tempfile BEFORE the
 * `db` module is imported (db.ts reads the env var at module load
 * time). Original env is restored on exit.
 */

import { test, after, before } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Set up the sandbox DB path BEFORE the db module loads. tsx evaluates
// imports top-down so this assignment lands first as long as it's
// declared above the imports.
const TEST_DIR = mkdtempSync(path.join(tmpdir(), "warroom-state-test-"));
const TEST_DB = path.join(TEST_DIR, "test.db");
process.env.WARROOM_DB_PATH = TEST_DB;

// Now safe to import — getDb() will materialise the test DB at TEST_DB.
import {
  getDb,
  startMission,
  getMissionStatus,
  getActiveMissions,
  setMissionStatus,
  saveLeadContent,
  getLeadContent,
  recordMissionError,
  clearMissionError,
  getMissionError,
  advanceToKitReadyIfBothDone,
} from "../src/lib/db";

before(() => {
  // Touch the DB so initSchema runs (creates tables + migrations).
  getDb();
});

after(() => {
  try {
    getDb().close();
  } catch {
    // ignore — already closed or never opened
  }
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  delete process.env.WARROOM_DB_PATH;
});

function insertFakeJob(id: string, company: string): string {
  const db = getDb();
  db.prepare(
    `INSERT INTO seen_jobs (id, source, title, company)
     VALUES (?, ?, ?, ?)`
  ).run(id, "test", "Senior Engineer", company);
  return id;
}

// ---------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------

test("fresh job has effective status READY (NULL → READY)", () => {
  insertFakeJob("job-fresh-1", "Polaris Labs");
  assert.equal(getMissionStatus("job-fresh-1"), "READY");
});

test("startMission flips READY → IN_PROGRESS and stamps started_at", () => {
  insertFakeJob("job-start-1", "Polaris Labs");
  const result = startMission("job-start-1");
  assert.equal(result.started, true);
  if (!result.started) throw new Error("unreachable");
  assert.match(
    result.startedAt,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    "startedAt should be ISO-formatted"
  );
  assert.equal(getMissionStatus("job-start-1"), "IN_PROGRESS");
});

test("double-start is rejected — chain cannot re-fire for the same lead", () => {
  insertFakeJob("job-double-1", "Helios");
  const first = startMission("job-double-1");
  assert.equal(first.started, true);

  const second = startMission("job-double-1");
  assert.equal(second.started, false);
  if (second.started) throw new Error("unreachable");
  assert.equal(second.reason, "not_ready");
  assert.equal(second.currentStatus, "IN_PROGRESS");

  assert.equal(getMissionStatus("job-double-1"), "IN_PROGRESS");
});

test("startMission on missing lead returns not_found (404 path)", () => {
  const result = startMission("nope-does-not-exist");
  assert.equal(result.started, false);
  if (result.started) throw new Error("unreachable");
  assert.equal(result.reason, "not_found");
});

test("getActiveMissions includes IN_PROGRESS rows only", () => {
  const db = getDb();
  db.prepare("DELETE FROM seen_jobs").run();

  insertFakeJob("active-ready", "ReadyCo");
  insertFakeJob("active-prog", "ProgCo");
  insertFakeJob("active-kit", "KitCo");
  insertFakeJob("active-ship", "ShipCo");

  startMission("active-prog");
  setMissionStatus("active-kit", "KIT_READY");
  setMissionStatus("active-ship", "SHIPPED");

  const active = getActiveMissions();
  assert.equal(active.length, 1, "exactly one IN_PROGRESS row");
  assert.equal(active[0].leadId, "active-prog");
  assert.equal(active[0].company, "ProgCo");
});

test("advancing IN_PROGRESS → KIT_READY removes from active set", () => {
  const db = getDb();
  db.prepare("DELETE FROM seen_jobs").run();
  insertFakeJob("advance-1", "AdvanceCo");
  startMission("advance-1");
  assert.equal(getActiveMissions().length, 1);

  setMissionStatus("advance-1", "KIT_READY");
  assert.equal(getActiveMissions().length, 0);
  assert.equal(getMissionStatus("advance-1"), "KIT_READY");
});

// v3 Plan A Phase 5 — Milestone tests deleted. The progress-phase
// ticker (PROGRESS_LINES + Set.has idempotency) was timer-driven
// theatre and has been removed in favour of real agent events
// flowing through SSE.

test("saveLeadContent writes a row with related_lead_id", () => {
  const db = getDb();
  db.prepare("DELETE FROM seen_jobs").run();
  db.prepare("DELETE FROM generated_content").run();
  insertFakeJob("content-1", "Polaris Labs");

  const id = saveLeadContent({
    leadId: "content-1",
    contentType: "cover_letter",
    generatedText: "Hello Polaris team, I shipped Trivia and Bond...",
  });
  assert.ok(id > 0, "saveLeadContent returns the new row id");

  const stored = db
    .prepare(
      `SELECT related_lead_id, content_type, generated_text
       FROM generated_content WHERE id = ?`
    )
    .get(id) as {
    related_lead_id: string;
    content_type: string;
    generated_text: string;
  };
  assert.equal(stored.related_lead_id, "content-1");
  assert.equal(stored.content_type, "cover_letter");
  assert.match(stored.generated_text, /Polaris/);
});

test("getLeadContent returns latest row for a lead — Layla panel reads this", () => {
  const db = getDb();
  db.prepare("DELETE FROM seen_jobs").run();
  db.prepare("DELETE FROM generated_content").run();
  insertFakeJob("content-2", "Helios");

  // No row yet — Layla's panel shows "Queued".
  assert.equal(getLeadContent("content-2"), null);

  // First write — picks up.
  saveLeadContent({
    leadId: "content-2",
    contentType: "cover_letter",
    generatedText: "Draft 1",
  });
  let got = getLeadContent("content-2");
  assert.ok(got);
  assert.equal(got!.generatedText, "Draft 1");
  assert.equal(got!.charCount, "Draft 1".length);
  assert.equal(got!.contentType, "cover_letter");

  // Second write (later draft) — getLeadContent returns the latest.
  // Force a later created_at via direct SQL since better-sqlite3's
  // datetime('now') may collide on sub-second writes.
  saveLeadContent({
    leadId: "content-2",
    contentType: "cover_letter",
    generatedText: "Draft 2 — improved",
  });
  // Bump created_at on the second insert so ORDER BY sees a delta.
  db.prepare(
    `UPDATE generated_content SET created_at = datetime('now', '+1 second')
     WHERE related_lead_id = 'content-2' AND generated_text = 'Draft 2 — improved'`
  ).run();
  got = getLeadContent("content-2");
  assert.equal(got!.generatedText, "Draft 2 — improved");
});

test("KIT_READY → SHIPPED transition (Phase C ship route logic)", () => {
  // Mirrors what /api/war-room/lead/[id]/mission/ship does. Conditional
  // UPDATE only flips when the row is currently KIT_READY.
  const db = getDb();
  db.prepare("DELETE FROM seen_jobs").run();
  insertFakeJob("ship-1", "Vega Industries");

  // From READY — ship UPDATE matches zero rows (no transition).
  let result = db
    .prepare(
      `UPDATE seen_jobs SET mission_status = 'SHIPPED'
       WHERE id = ? AND mission_status = 'KIT_READY'`
    )
    .run("ship-1");
  assert.equal(result.changes, 0, "Cannot ship from READY");

  // Advance through the state machine: READY → IN_PROGRESS → KIT_READY.
  startMission("ship-1");
  setMissionStatus("ship-1", "KIT_READY");
  assert.equal(getMissionStatus("ship-1"), "KIT_READY");

  // Now ship — UPDATE matches.
  result = db
    .prepare(
      `UPDATE seen_jobs SET mission_status = 'SHIPPED'
       WHERE id = ? AND mission_status = 'KIT_READY'`
    )
    .run("ship-1");
  assert.equal(result.changes, 1);
  assert.equal(getMissionStatus("ship-1"), "SHIPPED");

  // Re-ship from SHIPPED — UPDATE matches zero rows (terminal).
  result = db
    .prepare(
      `UPDATE seen_jobs SET mission_status = 'SHIPPED'
       WHERE id = ? AND mission_status = 'KIT_READY'`
    )
    .run("ship-1");
  assert.equal(result.changes, 0, "Cannot re-ship from SHIPPED");
});

test("recordMissionError + clearMissionError + getMissionError (Phase F)", () => {
  const db = getDb();
  db.prepare("DELETE FROM seen_jobs").run();
  insertFakeJob("err-1", "Vega Industries");

  // Clean state — no error.
  assert.equal(getMissionError("err-1"), null);

  // Record an error from Layla.
  recordMissionError("err-1", "layla", "Claude returned an empty response");
  const err = getMissionError("err-1");
  assert.ok(err);
  assert.match(err!.message, /^layla:/);
  assert.match(err!.message, /Claude returned/);
  assert.match(err!.at, /^\d{4}-\d{2}-\d{2}T/);

  // Clear it.
  clearMissionError("err-1");
  assert.equal(getMissionError("err-1"), null);

  // Re-record (overwrites the prior error rather than appending).
  recordMissionError("err-1", "kareem", "no ai_analysis");
  const err2 = getMissionError("err-1");
  assert.match(err2!.message, /^kareem:/);
});

test("force-advance: IN_PROGRESS → KIT_READY without artefact gate", () => {
  // Simulates the /mission/advance route logic.
  const db = getDb();
  db.prepare("DELETE FROM seen_jobs").run();
  db.prepare("DELETE FROM generated_content").run();
  db.prepare("DELETE FROM generated_resumes").run();
  insertFakeJob("force-1", "Lyra Tech");

  startMission("force-1");
  // No cover letter, no resume — composite gate would FAIL.
  assert.equal(advanceToKitReadyIfBothDone("force-1"), false);
  assert.equal(getMissionStatus("force-1"), "IN_PROGRESS");

  // Force-advance via the route's UPDATE.
  const result = db
    .prepare(
      `UPDATE seen_jobs SET mission_status = 'KIT_READY'
       WHERE id = ? AND mission_status = 'IN_PROGRESS'`
    )
    .run("force-1");
  assert.equal(result.changes, 1);
  assert.equal(getMissionStatus("force-1"), "KIT_READY");

  // Re-force is a no-op (already past IN_PROGRESS).
  const repeat = db
    .prepare(
      `UPDATE seen_jobs SET mission_status = 'KIT_READY'
       WHERE id = ? AND mission_status = 'IN_PROGRESS'`
    )
    .run("force-1");
  assert.equal(repeat.changes, 0);
});

test("getLeadContent isolates by leadId — no cross-talk", () => {
  const db = getDb();
  db.prepare("DELETE FROM seen_jobs").run();
  db.prepare("DELETE FROM generated_content").run();
  insertFakeJob("iso-a", "Alpha Co");
  insertFakeJob("iso-b", "Beta Co");

  saveLeadContent({
    leadId: "iso-a",
    contentType: "cover_letter",
    generatedText: "Alpha letter",
  });
  saveLeadContent({
    leadId: "iso-b",
    contentType: "cover_letter",
    generatedText: "Beta letter",
  });

  assert.equal(getLeadContent("iso-a")!.generatedText, "Alpha letter");
  assert.equal(getLeadContent("iso-b")!.generatedText, "Beta letter");
});
