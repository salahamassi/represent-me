/**
 * Wipe mission-related state without deleting your scouted jobs.
 *
 * Run:
 *   npx tsx scripts/wipe-mission-state.ts
 *   # or with --confirm to skip the safety prompt:
 *   npx tsx scripts/wipe-mission-state.ts --confirm
 *
 * What it does:
 *   - Resets mission_status / mission_started_at / mission_error /
 *     approval_status on every seen_jobs row → all leads back to READY.
 *   - Deletes every generated_content row (cover letters + social posts).
 *   - Deletes every generated_resumes row (tailored PDFs).
 *   - Deletes every agent_activity_log row (so the SSE chatter seed
 *     doesn't replay stale "kit-ready" events on next page load).
 *
 * What it KEEPS:
 *   - Every seen_jobs row (so you still have leads to trigger).
 *   - schedule_config (your cron schedules).
 *   - manual_leads, code_gems, oss_contributions, ai_usage_log.
 *
 * After running:
 *   1. Restart `npm run dev` if it's holding the DB.
 *   2. Open DevTools Console and run:
 *        for (const k of Object.keys(localStorage))
 *          if (k.startsWith("warroom.")) localStorage.removeItem(k);
 *      to wipe chat transcripts + the one-shot purge sentinel.
 *   3. Reload the War Room page.
 */

import { getDb } from "../src/lib/db";
import path from "node:path";
import fs from "node:fs";

const CONFIRM = process.argv.includes("--confirm");

function main() {
  const db = getDb();

  // Snapshot counts so we can show what changed.
  const before = {
    leads: (db.prepare("SELECT COUNT(*) as c FROM seen_jobs").get() as {
      c: number;
    }).c,
    leadsWithMission: (db
      .prepare(
        "SELECT COUNT(*) as c FROM seen_jobs WHERE mission_status IS NOT NULL"
      )
      .get() as { c: number }).c,
    content: (db
      .prepare("SELECT COUNT(*) as c FROM generated_content")
      .get() as { c: number }).c,
    resumes: (db
      .prepare("SELECT COUNT(*) as c FROM generated_resumes")
      .get() as { c: number }).c,
    activity: (db
      .prepare("SELECT COUNT(*) as c FROM agent_activity_log")
      .get() as { c: number }).c,
  };

  console.log("\n📊 Current state:");
  console.log(`  Leads:                  ${before.leads}`);
  console.log(`  Leads with mission:     ${before.leadsWithMission}`);
  console.log(`  generated_content rows: ${before.content}`);
  console.log(`  generated_resumes rows: ${before.resumes}`);
  console.log(`  agent_activity_log:     ${before.activity}`);

  if (!CONFIRM) {
    console.log(
      "\n⚠️  This will reset mission state for ALL leads + delete all"
    );
    console.log("   generated content, resumes, and activity logs.");
    console.log("   Your seen_jobs rows themselves are preserved.\n");
    console.log("   Re-run with --confirm to proceed:");
    console.log("     npx tsx scripts/wipe-mission-state.ts --confirm\n");
    return;
  }

  // Wrap in a transaction so partial failures don't leave the DB
  // half-cleaned.
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE seen_jobs SET
         mission_status = NULL,
         mission_started_at = NULL,
         mission_error = NULL,
         mission_error_at = NULL,
         approval_status = NULL`
    ).run();
    db.prepare("DELETE FROM generated_content").run();
    db.prepare("DELETE FROM generated_resumes").run();
    db.prepare("DELETE FROM agent_activity_log").run();
  });
  tx();

  console.log("\n✅ Wiped. New state:");
  const after = {
    leads: (db.prepare("SELECT COUNT(*) as c FROM seen_jobs").get() as {
      c: number;
    }).c,
    leadsWithMission: (db
      .prepare(
        "SELECT COUNT(*) as c FROM seen_jobs WHERE mission_status IS NOT NULL"
      )
      .get() as { c: number }).c,
    content: (db
      .prepare("SELECT COUNT(*) as c FROM generated_content")
      .get() as { c: number }).c,
    resumes: (db
      .prepare("SELECT COUNT(*) as c FROM generated_resumes")
      .get() as { c: number }).c,
    activity: (db
      .prepare("SELECT COUNT(*) as c FROM agent_activity_log")
      .get() as { c: number }).c,
  };
  console.log(`  Leads:                  ${after.leads}  (kept)`);
  console.log(
    `  Leads with mission:     ${after.leadsWithMission}  (was ${before.leadsWithMission})`
  );
  console.log(
    `  generated_content rows: ${after.content}  (was ${before.content})`
  );
  console.log(
    `  generated_resumes rows: ${after.resumes}  (was ${before.resumes})`
  );
  console.log(
    `  agent_activity_log:     ${after.activity}  (was ${before.activity})`
  );

  // Best-effort: nuke any tailored-PDF files written under data/
  // so the disk doesn't accumulate orphans pointing at deleted DB rows.
  // We only touch files whose name matches the pattern the resume
  // service writes (resume-<jobId>.pdf, tailored-resume-*.pdf, etc).
  const dataDir = path.join(process.cwd(), "data");
  let pdfsDeleted = 0;
  try {
    if (fs.existsSync(dataDir)) {
      for (const entry of fs.readdirSync(dataDir, { withFileTypes: true })) {
        if (
          entry.isFile() &&
          entry.name.endsWith(".pdf") &&
          /resume|tailored|cv/i.test(entry.name)
        ) {
          fs.unlinkSync(path.join(dataDir, entry.name));
          pdfsDeleted++;
        }
      }
    }
  } catch (err) {
    console.error("  (could not clean PDFs:", err, ")");
  }
  if (pdfsDeleted > 0) {
    console.log(`  Orphan PDFs deleted:    ${pdfsDeleted}`);
  }

  console.log("\n📌 Next steps:");
  console.log(
    "  1. If `npm run dev` was running, restart it (the DB connection cached"
  );
  console.log("     the schema on the running process).");
  console.log("  2. In your browser DevTools Console:");
  console.log(
    `     for (const k of Object.keys(localStorage)) if (k.startsWith("warroom.")) localStorage.removeItem(k);`
  );
  console.log("  3. Reload the War Room. All leads back to READY, fresh.\n");
}

main();
