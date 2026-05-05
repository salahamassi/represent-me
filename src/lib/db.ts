import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// v3 — DB path is overridable via WARROOM_DB_PATH so the state-machine
// test can point at an isolated sqlite file in tmpdir without
// polluting the project's real data dir. Evaluated LAZILY inside
// resolveDbPath() rather than at module-load time so tests setting
// the env var AFTER the static `import` (which ESM hoists above top-
// level code) still take effect on the first getDb() call.
function resolveDbPath(): string {
  return (
    process.env.WARROOM_DB_PATH ||
    path.join(process.cwd(), "data", "represent-me.db")
  );
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = resolveDbPath();
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS seen_jobs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      company TEXT,
      url TEXT,
      fit_percentage INTEGER,
      matched_skills TEXT,
      missing_skills TEXT,
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      notified_at TEXT,
      user_action TEXT
    );

    CREATE TABLE IF NOT EXISTS automation_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      findings_count INTEGER DEFAULT 0,
      actions_count INTEGER DEFAULT 0,
      error_message TEXT,
      notified INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS generated_content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suggestion_id TEXT,
      content_type TEXT NOT NULL,
      generated_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_action TEXT
    );

    CREATE TABLE IF NOT EXISTS schedule_config (
      agent_id TEXT PRIMARY KEY,
      cron_expression TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      next_run_at TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      source_agent TEXT NOT NULL,
      target_agent TEXT,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      processed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS generated_resumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      job_title TEXT NOT NULL,
      company TEXT,
      fit_percentage INTEGER,
      pdf_path TEXT NOT NULL,
      ai_analysis TEXT,
      resume_data TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_action TEXT
    );

    CREATE TABLE IF NOT EXISTS ai_usage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      run_id INTEGER,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cost_usd REAL NOT NULL,
      model TEXT NOT NULL,
      duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER,
      agent_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      tokens_used INTEGER,
      cost_usd REAL,
      duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS oss_contributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      github_issue_url TEXT NOT NULL UNIQUE,
      repo_owner TEXT NOT NULL,
      repo_name TEXT NOT NULL,
      issue_number INTEGER NOT NULL,
      issue_title TEXT NOT NULL,
      issue_labels TEXT,
      language TEXT,
      status TEXT NOT NULL DEFAULT 'found',
      ai_analysis TEXT,
      pr_url TEXT,
      pr_number INTEGER,
      found_at TEXT NOT NULL DEFAULT (datetime('now')),
      notified_at TEXT,
      pr_opened_at TEXT,
      pr_merged_at TEXT,
      content_generated INTEGER DEFAULT 0,
      user_action TEXT
    );

    CREATE TABLE IF NOT EXISTS github_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total_repos INTEGER,
      original_repos INTEGER,
      total_stars INTEGER,
      followers INTEGER,
      top_languages TEXT,
      snapshot_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS code_gems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_name TEXT NOT NULL,
      file_path TEXT,
      gem_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      code_snippet TEXT,
      ai_analysis TEXT,
      content_id INTEGER,
      status TEXT NOT NULL DEFAULT 'found',
      found_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS github_actions (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      action_url TEXT,
      action_type TEXT NOT NULL DEFAULT 'link',
      priority TEXT NOT NULL DEFAULT 'medium',
      completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Phase 9 — LinkedIn OAuth tokens. Single-row table (CHECK id=1)
    -- since this is a personal automation with one signed-in user.
    -- Self-serve "Share on LinkedIn" apps get a 60-day access token
    -- but typically NO refresh token (that is a partner-tier feature)
    -- so the refresh_token column is nullable. When null, the
    -- publisher tells the user to re-run the OAuth flow as the access
    -- token nears expiry. Re-running the flow simply replaces this
    -- row.
    CREATE TABLE IF NOT EXISTS linkedin_auth (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at TEXT NOT NULL,
      member_urn TEXT NOT NULL,
      scope TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migrations: add columns (safe to re-run, each try/catches if column exists)
  const migrations = [
    "ALTER TABLE seen_jobs ADD COLUMN ai_analysis TEXT",
    "ALTER TABLE seen_jobs ADD COLUMN salary_estimate TEXT",
    "ALTER TABLE seen_jobs ADD COLUMN resume_id INTEGER",
    "ALTER TABLE seen_jobs ADD COLUMN auto_applied INTEGER DEFAULT 0",
    // Phase 6 — Obeida Workflow: manual-lead consultation chain fields.
    // All nullable so legacy rows don't break. `kit_status` transitions
    // through: submitted → analyzed → kit-ready (or error).
    "ALTER TABLE seen_jobs ADD COLUMN jd_text TEXT",
    "ALTER TABLE seen_jobs ADD COLUMN contact_name TEXT",
    "ALTER TABLE seen_jobs ADD COLUMN referral_context TEXT",
    "ALTER TABLE seen_jobs ADD COLUMN key_success_factors TEXT",
    "ALTER TABLE seen_jobs ADD COLUMN qalam_brief TEXT",
    "ALTER TABLE seen_jobs ADD COLUMN recommendation_draft TEXT",
    "ALTER TABLE seen_jobs ADD COLUMN cover_letter_text TEXT",
    "ALTER TABLE seen_jobs ADD COLUMN kit_status TEXT",
    "ALTER TABLE seen_jobs ADD COLUMN kit_resume_path TEXT",
    // Approval gate (added 2026-04). Values: 'pending_approval' | 'approved' | NULL.
    // Legacy rows (NULL) are treated as approved so the gate doesn't
    // retroactively block work in flight when the migration runs.
    "ALTER TABLE seen_jobs ADD COLUMN approval_status TEXT",
    "ALTER TABLE generated_content ADD COLUMN user_tips TEXT",
    "ALTER TABLE generated_content ADD COLUMN score INTEGER",
    "ALTER TABLE generated_content ADD COLUMN score_verdict TEXT",
    "ALTER TABLE generated_content ADD COLUMN score_one_liner TEXT",
    "ALTER TABLE generated_content ADD COLUMN score_tips TEXT",
    "ALTER TABLE generated_content ADD COLUMN scored_at TEXT",
    "ALTER TABLE generated_content ADD COLUMN linkedin_post_url TEXT",
    "ALTER TABLE generated_content ADD COLUMN scheduled_for TEXT",
    // Ghada (Visual Lead) — DALL-E generated visual artefacts.
    // image_url is the public path (/wr-visuals/{contentId}.png) we
    // serve from /public; image_prompt records the structured prompt
    // so Salah can iterate on it without losing the original.
    "ALTER TABLE generated_content ADD COLUMN image_url TEXT",
    "ALTER TABLE generated_content ADD COLUMN image_prompt TEXT",
    // v3 (Plan A) — Mission state machine for the War Room apply chain.
    //   READY        — default; lead exists, no chain triggered yet.
    //   IN_PROGRESS  — Salah pressed "Trigger apply chain"; agents working.
    //   KIT_READY    — chain animation completed; cover/CV ready for review.
    //   SHIPPED      — Salah confirmed he sent the application.
    // The transition READY → IN_PROGRESS is gated by a status check so
    // double-fires from the UI return 409. Legacy NULL is treated as
    // READY everywhere so old rows don't need a backfill.
    "ALTER TABLE seen_jobs ADD COLUMN mission_status TEXT",
    "ALTER TABLE seen_jobs ADD COLUMN mission_started_at TEXT",
    // v3 Plan A Phase F — Last error from a mission's agent run.
    // Layla/Kareem record their catch blocks here so the LeadDetail
    // panel can surface a "retry" affordance. NULL when no error;
    // cleared when retry succeeds. Honest about WHICH agent failed
    // (the `which` prefix on the message identifies it).
    "ALTER TABLE seen_jobs ADD COLUMN mission_error TEXT",
    "ALTER TABLE seen_jobs ADD COLUMN mission_error_at TEXT",
    // v3 Plan A Phase 3 — Associate generated_content rows with the
    // seen_jobs row that triggered the agent run. Lets Layla's panel
    // query "what did the content agent produce for THIS specific
    // lead" instead of timer-driven theatre. Nullable so existing
    // rows (broadcast posts, code gems, etc.) stay valid.
    "ALTER TABLE generated_content ADD COLUMN related_lead_id TEXT",
    // Bulk Reviewer kit fields. Persisted alongside the cover_letter row
    // so a reload doesn't lose Salah's edits to the tailored resume.
    // resume_bullets is a JSON array of strings (top-3 tailored bullets).
    "ALTER TABLE generated_content ADD COLUMN tailored_summary TEXT",
    "ALTER TABLE generated_content ADD COLUMN resume_bullets TEXT",
    // Carousel feature (Phase 3, 2026-04). Multi-slide PDF generated
    // by Layla and rendered via Satori + pdf-lib. Stored under
    // `data/carousels/{id}.pdf` (gitignored) and served via
    // `/api/content/:id/carousel` (GET). Deck JSON is persisted so we
    // can re-render without re-prompting Claude.
    "ALTER TABLE generated_content ADD COLUMN carousel_pdf_url TEXT",
    "ALTER TABLE generated_content ADD COLUMN carousel_deck_json TEXT",
    "ALTER TABLE generated_content ADD COLUMN carousel_brand_id TEXT",
    // Phase 7 — narrative-only post body that goes alongside the
    // carousel PDF on LinkedIn. The original code-heavy draft stays
    // in `generated_text` for A/B; the publish flow + the card UI
    // prefer this column when populated.
    "ALTER TABLE generated_content ADD COLUMN carousel_post_text TEXT",
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }

  // Seed default schedules if empty
  const count = db.prepare("SELECT COUNT(*) as c FROM schedule_config").get() as { c: number };
  if (count.c === 0) {
    const insert = db.prepare(
      "INSERT INTO schedule_config (agent_id, cron_expression, enabled) VALUES (?, ?, ?)"
    );
    insert.run("job-matcher", "0 */6 * * *", 1);
    // Content cadence (3x/week): Mon=code gems, Wed=weekly thought leadership, Fri=event-driven contribution posts
    insert.run("code-gems", "0 9 * * 1", 1);
    insert.run("content", "0 9 * * 3", 1);
    insert.run("github", "0 8 * * *", 1);
    insert.run("linkedin", "0 9 * * 1", 0);
    insert.run("resume", "0 0 * * 0", 0);
    insert.run("issue-hunter", "0 */8 * * *", 1);
    insert.run("pr-tracker", "0 */4 * * *", 1);
  }

  // Ensure new schedules exist for existing DBs
  const insertOrIgnore = db.prepare(
    "INSERT OR IGNORE INTO schedule_config (agent_id, cron_expression, enabled) VALUES (?, ?, ?)"
  );
  insertOrIgnore.run("issue-hunter", "0 */8 * * *", 1);
  insertOrIgnore.run("pr-tracker", "0 */4 * * *", 1);
  insertOrIgnore.run("github-report", "0 20 * * 0", 0);
  insertOrIgnore.run("code-gems", "0 9 * * 1", 1);

  // Migrate existing DBs to the 3x/week content cadence (Mon code-gems, Wed weekly).
  // Only updates if the user hasn't already customized the cron expression.
  db.prepare(
    "UPDATE schedule_config SET cron_expression = ? WHERE agent_id = ? AND cron_expression = ?"
  ).run("0 9 * * 1", "code-gems", "0 10 * * 3");
  db.prepare(
    "UPDATE schedule_config SET cron_expression = ? WHERE agent_id = ? AND cron_expression = ?"
  ).run("0 9 * * 3", "content", "0 9 * * 1");
}

// --- Job helpers ---

export function isJobSeen(jobId: string): boolean {
  const db = getDb();
  const row = db.prepare("SELECT id FROM seen_jobs WHERE id = ?").get(jobId);
  return !!row;
}

export function markJobSeen(job: {
  id: string;
  source: string;
  title: string;
  company?: string;
  url?: string;
  fitPercentage?: number;
  matchedSkills?: string[];
  missingSkills?: string[];
}) {
  const db = getDb();
  // New rows always start in `pending_approval`. Salah must explicitly
  // approve before downstream agents (Layla / Kareem / Amin) act on
  // the lead. INSERT OR IGNORE preserves status on existing rows.
  db.prepare(
    `INSERT OR IGNORE INTO seen_jobs (id, source, title, company, url, fit_percentage, matched_skills, missing_skills, approval_status, notified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_approval', datetime('now'))`
  ).run(
    job.id,
    job.source,
    job.title,
    job.company || null,
    job.url || null,
    job.fitPercentage || null,
    job.matchedSkills ? JSON.stringify(job.matchedSkills) : null,
    job.missingSkills ? JSON.stringify(job.missingSkills) : null
  );
}

// --- Manual-lead (Obeida Workflow) helpers ---
// Manual leads ride on the same seen_jobs table with source="manual-lead".
// We add a constellation of nullable columns (jd_text, contact_name,
// referral_context, key_success_factors, qalam_brief, recommendation_draft,
// cover_letter_text, kit_status, kit_resume_path) so the whole
// consultation chain lives in one row — no foreign-key ceremony.

export interface ManualLeadInsert {
  id: string;
  title: string;
  company?: string;
  url?: string;
  jdText: string;
  contactName?: string;
  referralContext?: string;
}

/**
 * Create a fresh manual-lead row in `kit_status = 'submitted'` state.
 * The chain (Saqr analyze → Layla brief → Amin kit) updates the same
 * row as each agent finishes its step.
 *
 * `approval_status` defaults to `pending_approval` — Saqr will still
 * run his analysis (factors, summary, fit %) but Layla and Amin won't
 * act on the lead until Salah approves via the Command Bar.
 */
export function insertManualLead(lead: ManualLeadInsert): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO seen_jobs
       (id, source, title, company, url, jd_text, contact_name, referral_context, kit_status, approval_status, first_seen_at)
     VALUES (?, 'manual-lead', ?, ?, ?, ?, ?, ?, 'submitted', 'pending_approval', datetime('now'))`
  ).run(
    lead.id,
    lead.title,
    lead.company || null,
    lead.url || null,
    lead.jdText,
    lead.contactName || null,
    lead.referralContext || null
  );
}

// --- Approval gate helpers ---

/** Approval-status type guard for the gated subscriber checks. NULL is
 *  treated as approved (legacy rows from before the gate existed). */
export function isLeadApproved(status: string | null | undefined): boolean {
  return status === "approved" || status == null;
}

/** Read the current approval status for a lead. Returns null if the
 *  row doesn't exist (caller should treat as "approved" / no-op). */
export function getLeadApprovalStatus(leadId: string): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT approval_status FROM seen_jobs WHERE id = ?")
    .get(leadId) as { approval_status: string | null } | undefined;
  return row?.approval_status ?? null;
}

/** Flip the approval status. Used by the Approve endpoint to unlock
 *  Layla / Kareem / Amin / Resume Agent for the lead. */
export function setLeadApprovalStatus(leadId: string, status: "pending_approval" | "approved"): void {
  const db = getDb();
  db.prepare("UPDATE seen_jobs SET approval_status = ? WHERE id = ?").run(status, leadId);
}

// ===== Mission state machine (v3 Plan A) =====================================

/** All states a lead can be in along the apply chain. NULL legacy rows
 *  are treated as READY everywhere — no backfill migration needed. */
export type MissionStatus =
  | "READY"
  | "IN_PROGRESS"
  | "KIT_READY"
  | "SHIPPED";

/** Read the current mission status for a lead. Returns "READY" for
 *  rows with NULL or missing column (legacy + brand-new rows alike). */
export function getMissionStatus(leadId: string): MissionStatus {
  const db = getDb();
  const row = db
    .prepare("SELECT mission_status FROM seen_jobs WHERE id = ?")
    .get(leadId) as { mission_status: string | null } | undefined;
  if (!row) return "READY";
  const s = row.mission_status;
  if (s === "IN_PROGRESS" || s === "KIT_READY" || s === "SHIPPED") return s;
  return "READY";
}

/** Result of {@link startMission}. `started: false` with `reason:
 *  "not_ready"` means the row was already past READY (someone else
 *  fired the chain). `reason: "not_found"` means the lead doesn't
 *  exist. Both map to HTTP 409 / 404 in the route layer. */
export type StartMissionResult =
  | { started: true; startedAt: string }
  | { started: false; reason: "not_found" | "not_ready"; currentStatus: MissionStatus };

/** Atomically transition a lead READY → IN_PROGRESS, stamping the
 *  start time. Returns whether the transition happened — the caller
 *  uses the result to decide between 200 and 409. The condition is
 *  enforced in the WHERE clause so concurrent triggers from two tabs
 *  can't both succeed (only one UPDATE matches). */
export function startMission(leadId: string): StartMissionResult {
  const db = getDb();
  const exists = db
    .prepare("SELECT id FROM seen_jobs WHERE id = ?")
    .get(leadId) as { id: string } | undefined;
  if (!exists) {
    return { started: false, reason: "not_found", currentStatus: "READY" };
  }
  const startedAt = new Date().toISOString();
  // Conditional UPDATE — only flips the row if it's currently in a
  // pre-mission state (READY or NULL legacy). If two requests race,
  // SQLite serializes them and only the first matches.
  const result = db
    .prepare(
      `UPDATE seen_jobs
       SET mission_status = 'IN_PROGRESS',
           mission_started_at = ?
       WHERE id = ?
         AND (mission_status IS NULL OR mission_status = 'READY')`
    )
    .run(startedAt, leadId);
  if (result.changes === 0) {
    return {
      started: false,
      reason: "not_ready",
      currentStatus: getMissionStatus(leadId),
    };
  }
  return { started: true, startedAt };
}

/** Active mission row — what the floor-plan poller consumes to render
 *  MISSION ACTIVE pills, synthetic Layla/Kareem queue rows, and the
 *  progress ticker's milestone math. */
export interface ActiveMissionRow {
  leadId: string;
  company: string | null;
  fitPercentage: number | null;
  startedAt: string;
}

/** Fetch every lead currently IN_PROGRESS. Ordered by start time so
 *  most recent missions render first. KIT_READY and SHIPPED rows are
 *  excluded — those are post-mission states the floor doesn't animate. */
export function getActiveMissions(): ActiveMissionRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, company, fit_percentage, mission_started_at
       FROM seen_jobs
       WHERE mission_status = 'IN_PROGRESS'
       ORDER BY mission_started_at DESC`
    )
    .all() as {
    id: string;
    company: string | null;
    fit_percentage: number | null;
    mission_started_at: string | null;
  }[];
  return rows
    .filter((r) => !!r.mission_started_at)
    .map((r) => ({
      leadId: r.id,
      company: r.company,
      fitPercentage: r.fit_percentage,
      startedAt: r.mission_started_at!,
    }));
}

// ===== Mission error tracking (v3 Plan A Phase F) ============================

/** Record a mission error against a lead. Both Layla (content) and
 *  Kareem (resume) agents call this from their catch blocks so the
 *  LeadDetailPanel can show a "Retry mission" affordance. The `which`
 *  prefix identifies which agent failed so the UI can disambiguate
 *  ("Layla:" vs "Kareem:"). Truncated to 500 chars to keep panel
 *  copy reasonable. */
export function recordMissionError(
  leadId: string,
  which: "layla" | "kareem" | "system",
  message: string
): boolean {
  const db = getDb();
  const formatted = `${which}: ${(message || "unknown error").slice(0, 480)}`;
  const result = db
    .prepare(
      `UPDATE seen_jobs
       SET mission_error = ?, mission_error_at = ?
       WHERE id = ?`
    )
    .run(formatted, new Date().toISOString(), leadId);
  return result.changes > 0;
}

/** Clear mission error fields. Called by the retry endpoint before
 *  re-publishing `mission:started` so the UI doesn't show a stale
 *  error during the retry. */
export function clearMissionError(leadId: string): boolean {
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE seen_jobs SET mission_error = NULL, mission_error_at = NULL
       WHERE id = ?`
    )
    .run(leadId);
  return result.changes > 0;
}

/** Read the mission error for a lead. Returns null when clean. */
export function getMissionError(
  leadId: string
): { message: string; at: string } | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT mission_error, mission_error_at FROM seen_jobs WHERE id = ?`
    )
    .get(leadId) as
    | { mission_error: string | null; mission_error_at: string | null }
    | undefined;
  if (!row?.mission_error) return null;
  return {
    message: row.mission_error,
    at: row.mission_error_at || new Date().toISOString(),
  };
}

/** v3 Plan A Phase B — Composite "is the kit done?" check. Returns
 *  true iff BOTH the cover letter (Layla → generated_content) AND
 *  the tailored resume (Kareem → generated_resumes) exist for this
 *  lead. Used by Layla and Kareem's mission:started handlers to
 *  decide which agent's completion is the LAST one — that one flips
 *  the mission state from IN_PROGRESS to KIT_READY.
 *
 *  Returns false (no advance) when the mission is already past
 *  IN_PROGRESS so a re-fire can't undo a SHIPPED row. */
export function advanceToKitReadyIfBothDone(leadId: string): boolean {
  if (getMissionStatus(leadId) !== "IN_PROGRESS") return false;
  const hasCoverLetter = getLeadContent(leadId)?.contentType === "cover_letter";
  const hasResume = !!getLeadResume(leadId);
  if (!hasCoverLetter || !hasResume) return false;
  return setMissionStatus(leadId, "KIT_READY");
}

/** Force-set mission status — used by the auto-advancer (IN_PROGRESS
 *  → KIT_READY when the SLA elapses) and tests. Bypasses the WHERE
 *  guard in {@link startMission}; callers are expected to know what
 *  they're doing. Returns true if a row was updated. */
export function setMissionStatus(leadId: string, status: MissionStatus): boolean {
  const db = getDb();
  const result = db
    .prepare("UPDATE seen_jobs SET mission_status = ? WHERE id = ?")
    .run(status, leadId);
  return result.changes > 0;
}

// ===== Lead-scoped content (v3 Plan A Phase 3) ===============================

/** Shape of a generated_content row scoped to a specific lead. Used
 *  by Layla's workbench to surface "what did the content agent draft
 *  for THIS lead" — replaces the prior timer-driven synthetic row. */
export interface LeadContentRow {
  id: number;
  contentType: string;
  generatedText: string;
  charCount: number;
  createdAt: string;
  userAction: string | null;
}

/** Insert a generated_content row linked to a specific lead. Used by
 *  the content agent's `mission:started` subscriber. Returns the new
 *  row id so the caller can publish a bus event referencing it. */
export function saveLeadContent(args: {
  leadId: string;
  contentType: string;
  generatedText: string;
}): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO generated_content (content_type, generated_text, related_lead_id)
       VALUES (?, ?, ?)`
    )
    .run(args.contentType, args.generatedText, args.leadId);
  return Number(result.lastInsertRowid);
}

/** Shape of a generated_resumes row scoped to a single lead. Used by
 *  Kareem's workbench panel + the kit-ready auto-advance check. */
export interface LeadResumeRow {
  id: number;
  jobTitle: string;
  company: string | null;
  fitPercentage: number | null;
  pdfPath: string;
  pdfFilename: string;
  createdAt: string;
  userAction: string | null;
}

/** Latest generated_resumes row for a given lead. The resume agent
 *  uses `job_id` (legacy field name; pre-dates the `related_lead_id`
 *  column on generated_content) so we query by that. Returns null
 *  when no resume has been generated — the "Queued" state in
 *  Kareem's panel. */
export function getLeadResume(leadId: string): LeadResumeRow | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, job_title, company, fit_percentage, pdf_path, created_at, user_action
       FROM generated_resumes
       WHERE job_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(leadId) as
    | {
        id: number;
        job_title: string;
        company: string | null;
        fit_percentage: number | null;
        pdf_path: string;
        created_at: string;
        user_action: string | null;
      }
    | undefined;
  if (!row) return null;
  // Filename is the basename of pdf_path — used to construct the
  // public download URL (`/api/jobs/resume?file=…`).
  const filename = row.pdf_path.split("/").pop() || "";
  return {
    id: row.id,
    jobTitle: row.job_title,
    company: row.company,
    fitPercentage: row.fit_percentage,
    pdfPath: row.pdf_path,
    pdfFilename: filename,
    createdAt: row.created_at,
    userAction: row.user_action,
  };
}

/** Latest generated_content row for a given lead, regardless of
 *  content_type. Returns null when nothing has been written yet (the
 *  "Queued" state in Layla's panel). */
export function getLeadContent(leadId: string): LeadContentRow | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, content_type, generated_text, created_at, user_action
       FROM generated_content
       WHERE related_lead_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(leadId) as
    | {
        id: number;
        content_type: string;
        generated_text: string;
        created_at: string;
        user_action: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    contentType: row.content_type,
    generatedText: row.generated_text,
    charCount: row.generated_text?.length ?? 0,
    createdAt: row.created_at,
    userAction: row.user_action,
  };
}

/** Shape returned by {@link getManualLead}. Fields are all optional because
 *  the row is filled in as the chain progresses. */
export interface ManualLeadRow {
  id: string;
  title: string;
  company: string | null;
  url: string | null;
  jd_text: string | null;
  contact_name: string | null;
  referral_context: string | null;
  key_success_factors: string | null;
  qalam_brief: string | null;
  recommendation_draft: string | null;
  cover_letter_text: string | null;
  kit_status: string | null;
  kit_resume_path: string | null;
  fit_percentage: number | null;
  ai_analysis: string | null;
  first_seen_at: string;
}

export function getManualLead(leadId: string): ManualLeadRow | null {
  const db = getDb();
  return (db.prepare("SELECT * FROM seen_jobs WHERE id = ? AND source = 'manual-lead'").get(leadId) as ManualLeadRow | undefined) || null;
}

/** Most recent manual lead row — used by Qalam's chat prompt to decide
 *  whether to inject the Obeida / student-referral context. */
export function getLatestManualLead(): ManualLeadRow | null {
  const db = getDb();
  return (db.prepare("SELECT * FROM seen_jobs WHERE source = 'manual-lead' ORDER BY first_seen_at DESC LIMIT 1").get() as ManualLeadRow | undefined) || null;
}

/** Partial update — pass only the columns you want to change. */
export function updateManualLead(
  leadId: string,
  patch: Partial<{
    keySuccessFactors: string;
    qalamBrief: string;
    recommendationDraft: string;
    coverLetterText: string;
    kitStatus: string;
    kitResumePath: string;
    fitPercentage: number;
    aiAnalysis: string;
  }>
): void {
  const db = getDb();
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  const mapping: [keyof typeof patch, string][] = [
    ["keySuccessFactors", "key_success_factors"],
    ["qalamBrief", "qalam_brief"],
    ["recommendationDraft", "recommendation_draft"],
    ["coverLetterText", "cover_letter_text"],
    ["kitStatus", "kit_status"],
    ["kitResumePath", "kit_resume_path"],
    ["fitPercentage", "fit_percentage"],
    ["aiAnalysis", "ai_analysis"],
  ];
  for (const [jsKey, sqlCol] of mapping) {
    if (patch[jsKey] !== undefined) {
      sets.push(`${sqlCol} = ?`);
      values.push(patch[jsKey] as string | number);
    }
  }
  if (sets.length === 0) return;
  values.push(leadId);
  db.prepare(`UPDATE seen_jobs SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function updateJobSkills(jobId: string, matchedSkills: string[], missingSkills: string[]) {
  const db = getDb();
  db.prepare(
    "UPDATE seen_jobs SET matched_skills = ?, missing_skills = ? WHERE id = ?"
  ).run(JSON.stringify(matchedSkills), JSON.stringify(missingSkills), jobId);
}

/**
 * Set (or clear) the user's action on a job. Pass `null` to wipe the
 * state entirely — used by the Jobs UI when the user un-marks an
 * applied job so the row moves back to the Pending tab with no memory
 * that it was ever marked.
 */
export function updateJobAction(jobId: string, action: string | null) {
  const db = getDb();
  db.prepare("UPDATE seen_jobs SET user_action = ? WHERE id = ?").run(action, jobId);
}

// --- Run log helpers ---

export function logRunStart(agentId: string): number {
  const db = getDb();
  const result = db.prepare(
    "INSERT INTO automation_runs (agent_id, status) VALUES (?, 'running')"
  ).run(agentId);
  return Number(result.lastInsertRowid);
}

export function logRunEnd(
  runId: number,
  status: "success" | "error",
  findingsCount: number,
  actionsCount: number,
  errorMessage?: string
) {
  const db = getDb();
  db.prepare(
    `UPDATE automation_runs
     SET finished_at = datetime('now'), status = ?, findings_count = ?, actions_count = ?, error_message = ?
     WHERE id = ?`
  ).run(status, findingsCount, actionsCount, errorMessage || null, runId);
}

export function markRunNotified(runId: number) {
  const db = getDb();
  db.prepare("UPDATE automation_runs SET notified = 1 WHERE id = ?").run(runId);
}

export function getRunHistory(limit = 50, agentId?: string) {
  const db = getDb();
  if (agentId) {
    return db
      .prepare(
        "SELECT * FROM automation_runs WHERE agent_id = ? ORDER BY started_at DESC LIMIT ?"
      )
      .all(agentId, limit);
  }
  return db
    .prepare("SELECT * FROM automation_runs ORDER BY started_at DESC LIMIT ?")
    .all(limit);
}

// --- Schedule helpers ---

export function getScheduleConfigs() {
  const db = getDb();
  return db.prepare("SELECT * FROM schedule_config ORDER BY agent_id").all();
}

export function updateScheduleConfig(agentId: string, updates: { enabled?: number; cron_expression?: string; last_run_at?: string; next_run_at?: string }) {
  const db = getDb();
  const sets: string[] = [];
  const values: (string | number)[] = [];

  if (updates.enabled !== undefined) { sets.push("enabled = ?"); values.push(updates.enabled); }
  if (updates.cron_expression) { sets.push("cron_expression = ?"); values.push(updates.cron_expression); }
  if (updates.last_run_at) { sets.push("last_run_at = ?"); values.push(updates.last_run_at); }
  if (updates.next_run_at) { sets.push("next_run_at = ?"); values.push(updates.next_run_at); }

  if (sets.length === 0) return;
  values.push(agentId);
  db.prepare(`UPDATE schedule_config SET ${sets.join(", ")} WHERE agent_id = ?`).run(...values);
}

// --- Content helpers ---

export function insertGeneratedContent(contentType: string, text: string, suggestionId?: string): number {
  const db = getDb();
  const result = db.prepare(
    "INSERT INTO generated_content (suggestion_id, content_type, generated_text) VALUES (?, ?, ?)"
  ).run(suggestionId || null, contentType, text);
  return Number(result.lastInsertRowid);
}

// ===== Bulk Reviewer kit helpers ============================================
//
// Each generated job kit is one `generated_content` row keyed by
// `suggestion_id = job-{jobId}` and `content_type = 'cover_letter'`. The
// row carries three editable fields: the cover letter (`generated_text`),
// the tailored resume summary (`tailored_summary`), and the top-3 resume
// bullets (`resume_bullets`, stored as a JSON array of strings).

export interface JobKitRow {
  coverLetter: string | null;
  tailoredSummary: string | null;
  resumeBullets: string[];
}

/** Read the kit for a job. Returns null if no kit has been generated yet
 *  (i.e. no `generated_content` row exists for this `job-{jobId}` key). */
export function getJobKit(jobId: string): JobKitRow | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT generated_text, tailored_summary, resume_bullets
       FROM generated_content
       WHERE suggestion_id = ? AND content_type = 'cover_letter'
       ORDER BY id DESC LIMIT 1`
    )
    .get(`job-${jobId}`) as
    | { generated_text: string | null; tailored_summary: string | null; resume_bullets: string | null }
    | undefined;
  if (!row) return null;
  let bullets: string[] = [];
  if (row.resume_bullets) {
    try {
      const parsed = JSON.parse(row.resume_bullets);
      if (Array.isArray(parsed)) bullets = parsed.filter((s): s is string => typeof s === "string");
    } catch {
      bullets = [];
    }
  }
  return {
    coverLetter: row.generated_text,
    tailoredSummary: row.tailored_summary,
    resumeBullets: bullets,
  };
}

/** Patch any subset of the kit fields. The Bulk Reviewer modal calls
 *  this from a debounced auto-save while Salah edits — only fields the
 *  caller passes get written, so two concurrent saves on different
 *  fields don't clobber each other. Updates the most-recent kit row
 *  for the job; returns true if a row was touched. */
export function updateJobKit(
  jobId: string,
  fields: { coverLetter?: string; tailoredSummary?: string; resumeBullets?: string[] }
): boolean {
  const db = getDb();
  const sets: string[] = [];
  const values: (string | null)[] = [];
  if (fields.coverLetter !== undefined) {
    sets.push("generated_text = ?");
    values.push(fields.coverLetter);
  }
  if (fields.tailoredSummary !== undefined) {
    sets.push("tailored_summary = ?");
    values.push(fields.tailoredSummary);
  }
  if (fields.resumeBullets !== undefined) {
    sets.push("resume_bullets = ?");
    values.push(JSON.stringify(fields.resumeBullets));
  }
  if (sets.length === 0) return false;
  // Scope the UPDATE to the most-recent row for this job. Subquery is
  // SQLite-safe; no risk of touching the wrong content_type since the
  // suggestion_id key already isolates the job's kit.
  const result = db
    .prepare(
      `UPDATE generated_content SET ${sets.join(", ")}
       WHERE id = (
         SELECT id FROM generated_content
         WHERE suggestion_id = ? AND content_type = 'cover_letter'
         ORDER BY id DESC LIMIT 1
       )`
    )
    .run(...values, `job-${jobId}`);
  return result.changes > 0;
}

/** Atomic SHIP: flips both `user_action='apply_later'` (the Jobs-page
 *  filter convention; matches what the existing "Mark as Applied"
 *  button writes) AND `mission_status='SHIPPED'` (the War Room truth)
 *  so the row is consistent across both surfaces. Unconditional —
 *  Bulk Reviewer semantics ("Salah confirmed he sent this") aren't
 *  gated on a prior KIT_READY transition. */
export function shipJob(jobId: string): boolean {
  const db = getDb();
  const result = db
    .prepare(
      "UPDATE seen_jobs SET user_action = 'apply_later', mission_status = 'SHIPPED' WHERE id = ?"
    )
    .run(jobId);
  return result.changes > 0;
}

export function updateContentAction(contentId: number, action: string) {
  const db = getDb();
  db.prepare("UPDATE generated_content SET user_action = ? WHERE id = ?").run(action, contentId);
}

/**
 * Mark a content row as actually live on LinkedIn (via Zernio auto-post) and
 * store the platform URL for the UI. Called only after a confirmed Zernio
 * success — on failure the row stays `approved` so it shows up in the "not
 * published yet" bucket.
 */
export function markContentPublished(contentId: number, linkedinUrl: string | null) {
  const db = getDb();
  db.prepare(
    "UPDATE generated_content SET user_action = 'published', linkedin_post_url = ? WHERE id = ?"
  ).run(linkedinUrl, contentId);
}

/**
 * Save Ghada's generated image alongside the original content row.
 * `imageUrl` is the public path (`/wr-visuals/{id}.png`) we serve from
 * `/public`; `imagePrompt` records the prompt used for transparency
 * + the regenerate flow.
 */
export function setContentImage(
  contentId: number,
  imageUrl: string | null,
  imagePrompt: string | null
) {
  const db = getDb();
  db.prepare(
    "UPDATE generated_content SET image_url = ?, image_prompt = ? WHERE id = ?"
  ).run(imageUrl, imagePrompt, contentId);
}

/**
 * Persist Layla's carousel artefacts on a content row. `pdfUrl` is the
 * route path (`/api/content/{id}/carousel`) — not the on-disk path —
 * so the UI can link to it directly. `deckJson` is the validated
 * CarouselDeck object stringified, so re-renders don't re-prompt
 * Claude. `brandId` is the resolved brand id (e.g. "bond" or
 * "default") for telemetry + future per-brand UI affordances.
 * `postText` is the Phase 7 narrative-only rewrite — preferred over
 * `generated_text` by the publish + display layers when present.
 */
export function setCarouselArtifacts(
  contentId: number,
  artefacts: {
    pdfUrl: string | null;
    deckJson: string | null;
    brandId: string | null;
    postText?: string | null;
  }
) {
  const db = getDb();
  // Two paths so we don't accidentally clobber `carousel_post_text`
  // when a caller (e.g. DELETE handler) doesn't pass it. Explicit
  // `null` still clears it.
  if (artefacts.postText !== undefined) {
    db.prepare(
      "UPDATE generated_content SET carousel_pdf_url = ?, carousel_deck_json = ?, carousel_brand_id = ?, carousel_post_text = ? WHERE id = ?"
    ).run(
      artefacts.pdfUrl,
      artefacts.deckJson,
      artefacts.brandId,
      artefacts.postText,
      contentId
    );
  } else {
    db.prepare(
      "UPDATE generated_content SET carousel_pdf_url = ?, carousel_deck_json = ?, carousel_brand_id = ? WHERE id = ?"
    ).run(artefacts.pdfUrl, artefacts.deckJson, artefacts.brandId, contentId);
  }
}

/**
 * Phase 9 — LinkedIn OAuth token persistence. Single-row table; only
 * one user is ever signed in. Access tokens are valid for 60 days.
 * Refresh tokens are partner-tier only — for self-serve "Share on
 * LinkedIn" apps, `refreshToken` will be null. The publisher checks
 * `expiresAt` on every call and surfaces a "re-run /oauth/start"
 * error when the token is within 24 hours of expiry without a
 * refresh token to fall back on.
 */
export interface LinkedInAuth {
  accessToken: string;
  /** Null on self-serve apps (no refresh-token grant). When null, the
   *  user re-runs the OAuth flow once every ~60 days to refresh. */
  refreshToken: string | null;
  /** ISO timestamp of access-token expiry. */
  expiresAt: string;
  /** `urn:li:person:<id>` — the OAuth'd user's profile URN. Used as
   *  the `author` field on every published post. */
  memberUrn: string;
  /** Granted scopes (space-separated, as returned by LinkedIn). */
  scope: string;
}

export function getLinkedInAuth(): LinkedInAuth | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT access_token, refresh_token, expires_at, member_urn, scope FROM linkedin_auth WHERE id = 1"
    )
    .get() as
    | {
        access_token: string;
        refresh_token: string | null;
        expires_at: string;
        member_urn: string;
        scope: string;
      }
    | undefined;
  if (!row) return null;
  return {
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: row.expires_at,
    memberUrn: row.member_urn,
    scope: row.scope,
  };
}

export function setLinkedInAuth(auth: LinkedInAuth): void {
  const db = getDb();
  // INSERT OR REPLACE so we don't have to branch on first-auth vs
  // refresh; the CHECK (id = 1) constraint enforces single-row.
  db.prepare(
    `INSERT OR REPLACE INTO linkedin_auth
       (id, access_token, refresh_token, expires_at, member_urn, scope, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    auth.accessToken,
    auth.refreshToken,
    auth.expiresAt,
    auth.memberUrn,
    auth.scope
  );
}

/** Wipe the LinkedIn auth row. Used by the disconnect / re-auth path
 *  if we ever need it; safe to call when no row exists. */
export function clearLinkedInAuth(): void {
  const db = getDb();
  db.prepare("DELETE FROM linkedin_auth WHERE id = 1").run();
}

/** Read the carousel artefact fields for a content row. Returns null
 *  when no carousel has been generated yet (any of the four columns
 *  unset). */
export function getCarouselArtifacts(contentId: number): {
  pdfUrl: string | null;
  deckJson: string | null;
  brandId: string | null;
  postText: string | null;
} | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT carousel_pdf_url, carousel_deck_json, carousel_brand_id, carousel_post_text FROM generated_content WHERE id = ?"
    )
    .get(contentId) as
    | {
        carousel_pdf_url: string | null;
        carousel_deck_json: string | null;
        carousel_brand_id: string | null;
        carousel_post_text: string | null;
      }
    | undefined;
  if (!row) return null;
  if (!row.carousel_pdf_url && !row.carousel_deck_json) return null;
  return {
    pdfUrl: row.carousel_pdf_url,
    deckJson: row.carousel_deck_json,
    brandId: row.carousel_brand_id,
    postText: row.carousel_post_text,
  };
}

/** Read just the image fields for a content row — used by the visual
 *  API and Yusuf's queue brief shaping. */
export function getContentImage(contentId: number): {
  imageUrl: string | null;
  imagePrompt: string | null;
} {
  const db = getDb();
  const row = db
    .prepare("SELECT image_url, image_prompt FROM generated_content WHERE id = ?")
    .get(contentId) as
    | { image_url: string | null; image_prompt: string | null }
    | undefined;
  return {
    imageUrl: row?.image_url ?? null,
    imagePrompt: row?.image_prompt ?? null,
  };
}

/**
 * Mark a content row as scheduled-to-post on LinkedIn via Zernio. `scheduledAt`
 * is an ISO UTC timestamp indicating when Zernio will publish. The row moves
 * to `user_action='scheduled'` and stays there — we don't auto-flip it to
 * `published` because Zernio doesn't webhook back to us when a scheduled post
 * actually fires.
 */
export function markContentScheduled(contentId: number, scheduledAtISO: string) {
  const db = getDb();
  db.prepare(
    "UPDATE generated_content SET user_action = 'scheduled', scheduled_for = ? WHERE id = ?"
  ).run(scheduledAtISO, contentId);
}

/**
 * Replace the generated text of an existing content row in place.
 * Bumps created_at so it floats to the top of the list, stores the user tip
 * that drove the regeneration, and CLEARS any cached score (since the text
 * just changed, the old score is stale).
 */
export function updateContentText(contentId: number, newText: string, tips: string) {
  const db = getDb();
  db.prepare(
    `UPDATE generated_content
       SET generated_text = ?,
           user_tips = ?,
           created_at = datetime('now'),
           score = NULL,
           score_verdict = NULL,
           score_one_liner = NULL,
           score_tips = NULL,
           scored_at = NULL
     WHERE id = ?`
  ).run(newText, tips, contentId);
}

/**
 * Persist Claude's self-critique for a content row. Overwrites any prior score.
 * `tips` is serialised to JSON so we can round-trip a string[] through SQLite.
 */
export function saveContentScore(
  contentId: number,
  score: number,
  verdict: string,
  oneLineVerdict: string,
  tips: string[]
) {
  const db = getDb();
  db.prepare(
    `UPDATE generated_content
       SET score = ?,
           score_verdict = ?,
           score_one_liner = ?,
           score_tips = ?,
           scored_at = datetime('now')
     WHERE id = ?`
  ).run(score, verdict, oneLineVerdict, JSON.stringify(tips), contentId);
}

/**
 * Fetch a content row plus its source code_gem (if the suggestion_id
 * follows the "gem-N" convention). Returns null if the content doesn't exist;
 * returns { content, gem: null } if it exists but isn't gem-sourced.
 */
export function getContentWithGem(contentId: number) {
  const db = getDb();
  const content = db.prepare(
    "SELECT * FROM generated_content WHERE id = ?"
  ).get(contentId) as
    | { id: number; suggestion_id: string | null; content_type: string; generated_text: string; user_tips: string | null }
    | undefined;
  if (!content) return null;

  const gemMatch = content.suggestion_id?.match(/^gem-(\d+)$/);
  if (!gemMatch) return { content, gem: null };

  const gem = db.prepare("SELECT * FROM code_gems WHERE id = ?").get(Number(gemMatch[1])) as
    | { id: number; repo_name: string; file_path: string | null; gem_type: string; title: string; ai_analysis: string | null }
    | undefined;
  return { content, gem: gem || null };
}

export function getRecentContent(limit = 20) {
  const db = getDb();
  return db.prepare("SELECT * FROM generated_content ORDER BY created_at DESC LIMIT ?").all(limit);
}

export function getSeenJobs(limit = 50) {
  const db = getDb();
  return db.prepare("SELECT * FROM seen_jobs ORDER BY first_seen_at DESC LIMIT ?").all(limit);
}

// --- AI Usage helpers ---

export function logAIUsage(
  agentId: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
  model: string,
  durationMs: number,
  runId?: number
) {
  const db = getDb();
  db.prepare(
    `INSERT INTO ai_usage_log (agent_id, run_id, input_tokens, output_tokens, cost_usd, model, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(agentId, runId || null, inputTokens, outputTokens, costUsd, model, durationMs);
}

export function getAIUsageStats() {
  const db = getDb();
  return db.prepare(
    `SELECT agent_id,
            COUNT(*) as calls,
            SUM(input_tokens) as total_input,
            SUM(output_tokens) as total_output,
            SUM(cost_usd) as total_cost
     FROM ai_usage_log GROUP BY agent_id`
  ).all();
}

// --- Resume helpers ---

export function insertGeneratedResume(data: {
  jobId: string;
  jobTitle: string;
  company: string;
  fitPercentage: number;
  pdfPath: string;
  aiAnalysis: string;
  resumeData: string;
}): number {
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO generated_resumes (job_id, job_title, company, fit_percentage, pdf_path, ai_analysis, resume_data)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(data.jobId, data.jobTitle, data.company, data.fitPercentage, data.pdfPath, data.aiAnalysis, data.resumeData);
  return Number(result.lastInsertRowid);
}

export function updateJobAIAnalysis(jobId: string, aiAnalysis: string, salaryEstimate?: string) {
  const db = getDb();
  db.prepare(
    "UPDATE seen_jobs SET ai_analysis = ?, salary_estimate = ? WHERE id = ?"
  ).run(aiAnalysis, salaryEstimate || null, jobId);
}

export function linkResumeToJob(jobId: string, resumeId: number) {
  const db = getDb();
  db.prepare("UPDATE seen_jobs SET resume_id = ? WHERE id = ?").run(resumeId, jobId);
}

// --- Agent message helpers ---

export function logAgentMessage(eventType: string, source: string, target: string | null, payload: string) {
  const db = getDb();
  db.prepare(
    "INSERT INTO agent_messages (event_type, source_agent, target_agent, payload) VALUES (?, ?, ?, ?)"
  ).run(eventType, source, target, payload);
}

// --- OSS Contribution helpers ---

export function isContributionSeen(issueUrl: string): boolean {
  const db = getDb();
  const row = db.prepare("SELECT id FROM oss_contributions WHERE github_issue_url = ?").get(issueUrl);
  return !!row;
}

export function insertContribution(data: {
  issueUrl: string;
  repoOwner: string;
  repoName: string;
  issueNumber: number;
  issueTitle: string;
  issueLabels?: string[];
  language?: string;
  aiAnalysis?: string;
}): number {
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO oss_contributions (github_issue_url, repo_owner, repo_name, issue_number, issue_title, issue_labels, language, ai_analysis, status, notified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'notified', datetime('now'))`
  ).run(
    data.issueUrl, data.repoOwner, data.repoName, data.issueNumber,
    data.issueTitle, data.issueLabels ? JSON.stringify(data.issueLabels) : null,
    data.language || null, data.aiAnalysis || null
  );
  return Number(result.lastInsertRowid);
}

export function updateContributionStatus(
  id: number,
  status: string,
  extras?: { prUrl?: string; prNumber?: number }
) {
  const db = getDb();
  const sets = ["status = ?"];
  const values: (string | number)[] = [status];

  if (status === "pr_opened") {
    sets.push("pr_opened_at = datetime('now')");
    if (extras?.prUrl) { sets.push("pr_url = ?"); values.push(extras.prUrl); }
    if (extras?.prNumber) { sets.push("pr_number = ?"); values.push(extras.prNumber); }
  }
  if (status === "pr_merged") {
    sets.push("pr_merged_at = datetime('now')");
  }

  values.push(id);
  db.prepare(`UPDATE oss_contributions SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function getActiveContributions() {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM oss_contributions WHERE status IN ('working', 'pr_opened') ORDER BY found_at DESC"
  ).all();
}

export function getContributionsByStatus(status: string) {
  const db = getDb();
  return db.prepare("SELECT * FROM oss_contributions WHERE status = ? ORDER BY found_at DESC").all(status);
}

export function getContributionById(id: number) {
  const db = getDb();
  return db.prepare("SELECT * FROM oss_contributions WHERE id = ?").get(id);
}

export function markContributionContentGenerated(id: number) {
  const db = getDb();
  db.prepare("UPDATE oss_contributions SET content_generated = 1 WHERE id = ?").run(id);
}

// --- Code Gems helpers ---

export function insertCodeGem(data: {
  repoName: string;
  filePath?: string;
  gemType: string;
  title: string;
  description: string;
  codeSnippet?: string;
  aiAnalysis?: string;
}): number {
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO code_gems (repo_name, file_path, gem_type, title, description, code_snippet, ai_analysis)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(data.repoName, data.filePath || null, data.gemType, data.title, data.description, data.codeSnippet || null, data.aiAnalysis || null);
  return Number(result.lastInsertRowid);
}

export function getCodeGems(limit = 20) {
  const db = getDb();
  return db.prepare("SELECT * FROM code_gems ORDER BY found_at DESC LIMIT ?").all(limit);
}

export function updateCodeGemContent(gemId: number, contentId: number) {
  const db = getDb();
  db.prepare("UPDATE code_gems SET content_id = ?, status = 'content_drafted' WHERE id = ?").run(contentId, gemId);
}

// --- Activity Log helpers ---

export function logActivity(entry: {
  runId?: number;
  agentId: string;
  eventType: string;
  title: string;
  detail?: string;
  tokensUsed?: number;
  costUsd?: number;
  durationMs?: number;
}) {
  const db = getDb();
  db.prepare(
    `INSERT INTO agent_activity_log (run_id, agent_id, event_type, title, detail, tokens_used, cost_usd, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entry.runId || null, entry.agentId, entry.eventType, entry.title,
    entry.detail || null, entry.tokensUsed || null, entry.costUsd || null, entry.durationMs || null
  );
}

/** Get the most recent error from the activity log, optionally filtered by agent */
export function getLastAgentError(agentId?: string, withinHours = 24) {
  const db = getDb();
  const conditions = ["event_type = 'error'", `created_at > datetime('now', '-${withinHours} hours')`];
  const values: (string | number)[] = [];
  if (agentId) {
    conditions.push("agent_id = ?");
    values.push(agentId);
  }
  return db.prepare(
    `SELECT id, agent_id, title, detail, created_at FROM agent_activity_log
     WHERE ${conditions.join(" AND ")}
     ORDER BY id DESC LIMIT 1`
  ).get(...values) as
    | { id: number; agent_id: string; title: string; detail: string | null; created_at: string }
    | undefined;
}

/**
 * Get activity_log rows strictly newer than `cursor` (monotonic id).
 * Used by the /api/agent-bus/stream SSE endpoint to push only new rows
 * to connected clients without re-sending the already-delivered tail.
 *
 * Returns oldest→newest so the caller can send them in chronological
 * order without sorting again.
 */
export function getActivityLogSince(cursor: number, limit = 200) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, run_id, agent_id, event_type, title, detail, tokens_used, cost_usd, duration_ms, created_at
         FROM agent_activity_log
        WHERE id > ?
        ORDER BY id ASC
        LIMIT ?`
    )
    .all(cursor, limit) as Array<{
    id: number;
    run_id: number | null;
    agent_id: string;
    event_type: string;
    title: string;
    detail: string | null;
    tokens_used: number | null;
    cost_usd: number | null;
    duration_ms: number | null;
    created_at: string;
  }>;
}

export function getActivityLog(limit = 100, agentId?: string, runId?: number) {
  const db = getDb();
  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (agentId) { conditions.push("agent_id = ?"); values.push(agentId); }
  if (runId) { conditions.push("run_id = ?"); values.push(runId); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(limit);

  return db.prepare(
    `SELECT * FROM agent_activity_log ${where} ORDER BY created_at DESC LIMIT ?`
  ).all(...values);
}

export function getEnhancedRunHistory(limit = 50) {
  const db = getDb();
  return db.prepare(
    `SELECT r.*,
            COALESCE(SUM(u.cost_usd), 0) as total_cost,
            COALESCE(SUM(u.input_tokens), 0) as total_input_tokens,
            COALESCE(SUM(u.output_tokens), 0) as total_output_tokens,
            CASE WHEN r.finished_at IS NOT NULL
              THEN CAST((julianday(r.finished_at) - julianday(r.started_at)) * 86400 AS INTEGER)
              ELSE NULL END as duration_seconds
     FROM automation_runs r
     LEFT JOIN ai_usage_log u ON u.run_id = r.id
     GROUP BY r.id
     ORDER BY r.started_at DESC
     LIMIT ?`
  ).all(limit);
}

export function getAllContributions(limit = 50) {
  const db = getDb();
  return db.prepare("SELECT * FROM oss_contributions ORDER BY found_at DESC LIMIT ?").all(limit);
}

export function getContentById(id: number) {
  const db = getDb();
  return db.prepare("SELECT * FROM generated_content WHERE id = ?").get(id) as
    | { id: number; content_type: string; generated_text: string; source_id: string; user_action: string | null; created_at: string }
    | undefined;
}

export function getContentByType(contentType: string, limit = 50) {
  const db = getDb();
  if (contentType === "all") {
    return db.prepare("SELECT * FROM generated_content ORDER BY created_at DESC LIMIT ?").all(limit);
  }
  return db.prepare(
    "SELECT * FROM generated_content WHERE content_type LIKE ? ORDER BY created_at DESC LIMIT ?"
  ).all(`%${contentType}%`, limit);
}

export function getTotalAICost() {
  const db = getDb();
  const today = db.prepare(
    "SELECT COALESCE(SUM(cost_usd), 0) as cost FROM ai_usage_log WHERE created_at >= date('now')"
  ).get() as { cost: number };
  const week = db.prepare(
    "SELECT COALESCE(SUM(cost_usd), 0) as cost FROM ai_usage_log WHERE created_at >= date('now', '-7 days')"
  ).get() as { cost: number };
  const month = db.prepare(
    "SELECT COALESCE(SUM(cost_usd), 0) as cost FROM ai_usage_log WHERE created_at >= date('now', '-30 days')"
  ).get() as { cost: number };
  return { today: today.cost, week: week.cost, month: month.cost };
}

// --- GitHub Snapshot helpers ---

export function insertGitHubSnapshot(data: {
  totalRepos: number;
  originalRepos: number;
  totalStars: number;
  followers: number;
  topLanguages: string;
}) {
  const db = getDb();
  db.prepare(
    "INSERT INTO github_snapshots (total_repos, original_repos, total_stars, followers, top_languages) VALUES (?, ?, ?, ?, ?)"
  ).run(data.totalRepos, data.originalRepos, data.totalStars, data.followers, data.topLanguages);
}

export function getLatestGitHubSnapshot() {
  const db = getDb();
  return db.prepare("SELECT * FROM github_snapshots ORDER BY snapshot_at DESC LIMIT 1").get();
}

export function getLatestGitHubInsights() {
  const db = getDb();

  // Get latest successful github run with cost info
  const latestRun = db.prepare(
    `SELECT r.*,
            COALESCE(SUM(u.cost_usd), 0) as total_cost,
            COALESCE(SUM(u.input_tokens + u.output_tokens), 0) as total_tokens,
            CASE WHEN r.finished_at IS NOT NULL
              THEN CAST((julianday(r.finished_at) - julianday(r.started_at)) * 86400 AS INTEGER)
              ELSE NULL END as duration_seconds
     FROM automation_runs r
     LEFT JOIN ai_usage_log u ON u.run_id = r.id
     WHERE r.agent_id = 'github' AND r.status = 'success'
     GROUP BY r.id
     ORDER BY r.started_at DESC LIMIT 1`
  ).get();

  // Get latest activities for github agent
  const activities = db.prepare(
    "SELECT * FROM agent_activity_log WHERE agent_id = 'github' ORDER BY created_at DESC LIMIT 20"
  ).all();

  return { latestRun, activities };
}

// --- GitHub Actions helpers ---

export function upsertGitHubAction(action: {
  id: string;
  category: string;
  title: string;
  description: string;
  actionUrl?: string;
  actionType?: string;
  priority?: string;
}) {
  const db = getDb();
  db.prepare(
    `INSERT INTO github_actions (id, category, title, description, action_url, action_type, priority)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, action_url=excluded.action_url, action_type=excluded.action_type`
  ).run(
    action.id, action.category, action.title, action.description,
    action.actionUrl || null, action.actionType || "link", action.priority || "medium"
  );
}

export function getGitHubActions() {
  const db = getDb();
  return db.prepare("SELECT * FROM github_actions ORDER BY completed ASC, priority DESC, created_at ASC").all();
}

export function removeGitHubAction(id: string) {
  const db = getDb();
  db.prepare("DELETE FROM github_actions WHERE id = ? AND completed = 0").run(id);
}

export function toggleGitHubAction(id: string, completed: boolean) {
  const db = getDb();
  db.prepare(
    "UPDATE github_actions SET completed = ?, completed_at = ? WHERE id = ?"
  ).run(completed ? 1 : 0, completed ? new Date().toISOString() : null, id);
}
