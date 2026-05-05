import Database from "better-sqlite3";
import path from "node:path";
const db = new Database(path.join(process.cwd(), "data", "represent-me.db"));
db.pragma("journal_mode = WAL");
const tables = ["seen_jobs","generated_content","generated_resumes","agent_activity_log","manual_leads","oss_contributions","code_gems","ai_usage_log","agent_run_history","agent_messages"];
const tx = db.transaction(() => {
  for (const t of tables) {
    try { db.prepare(`DELETE FROM ${t}`).run(); } catch (e) { console.error(t, (e as Error).message); }
  }
});
tx();
const counts: Record<string, number> = {};
for (const t of ["seen_jobs","generated_content","generated_resumes","agent_activity_log","manual_leads"]) {
  try {
    counts[t] = (db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get() as { c: number }).c;
  } catch {
    counts[t] = -1;
  }
}
console.log(JSON.stringify(counts));
db.close();
