import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "represent-me.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);
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
  `);

  // Migrations: add columns to seen_jobs (safe to re-run)
  const migrations = [
    "ALTER TABLE seen_jobs ADD COLUMN ai_analysis TEXT",
    "ALTER TABLE seen_jobs ADD COLUMN salary_estimate TEXT",
    "ALTER TABLE seen_jobs ADD COLUMN resume_id INTEGER",
    "ALTER TABLE seen_jobs ADD COLUMN auto_applied INTEGER DEFAULT 0",
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
    insert.run("content", "0 9 * * 1", 1);
    insert.run("github", "0 8 * * *", 1);
    insert.run("linkedin", "0 9 * * 1", 0);
    insert.run("resume", "0 0 * * 0", 0);
    insert.run("issue-hunter", "0 */8 * * *", 1);
    insert.run("pr-tracker", "0 */4 * * *", 1);
    insert.run("code-gems", "0 10 * * 3", 1);
  }

  // Ensure new schedules exist for existing DBs
  const insertOrIgnore = db.prepare(
    "INSERT OR IGNORE INTO schedule_config (agent_id, cron_expression, enabled) VALUES (?, ?, ?)"
  );
  insertOrIgnore.run("issue-hunter", "0 */8 * * *", 1);
  insertOrIgnore.run("pr-tracker", "0 */4 * * *", 1);
  insertOrIgnore.run("github-report", "0 20 * * 0", 0);
  insertOrIgnore.run("code-gems", "0 10 * * 3", 1);
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
  db.prepare(
    `INSERT OR IGNORE INTO seen_jobs (id, source, title, company, url, fit_percentage, matched_skills, missing_skills, notified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
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

export function updateJobSkills(jobId: string, matchedSkills: string[], missingSkills: string[]) {
  const db = getDb();
  db.prepare(
    "UPDATE seen_jobs SET matched_skills = ?, missing_skills = ? WHERE id = ?"
  ).run(JSON.stringify(matchedSkills), JSON.stringify(missingSkills), jobId);
}

export function updateJobAction(jobId: string, action: string) {
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

export function updateContentAction(contentId: number, action: string) {
  const db = getDb();
  db.prepare("UPDATE generated_content SET user_action = ? WHERE id = ?").run(action, contentId);
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
