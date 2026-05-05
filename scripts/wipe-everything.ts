/**
 * NUCLEAR WIPE — deletes the entire SQLite database and resets every
 * file artefact the agents have written. Use when you want a 100%
 * clean slate to verify the new mission flow with zero historical
 * baggage.
 *
 * Run:
 *   npx tsx scripts/wipe-everything.ts            # dry-run preview
 *   npx tsx scripts/wipe-everything.ts --confirm  # actually wipe
 *
 * What it deletes:
 *   - data/represent-me.db (main SQLite file)
 *   - data/represent-me.db-shm + -wal (WAL mode artefacts)
 *   - data/resumes/*.pdf (all generated tailored resumes)
 *   - data/*.pdf (any orphan resume PDFs in data/)
 *
 * What it preserves:
 *   - The data/ directory itself
 *   - The data/resumes/ directory itself (so the resume service can
 *     write fresh PDFs without recreating the dir)
 *
 * After it runs:
 *   1. Restart `npm run dev` — the running process holds the DB
 *      handle. Stopping AND restarting forces a fresh getDb() that
 *      runs initSchema() + every migration on an empty file.
 *   2. In your browser DevTools Console:
 *        for (const k of Object.keys(localStorage))
 *          if (k.startsWith("warroom.")) localStorage.removeItem(k);
 *      Wipes chat transcripts, the purge sentinel, and any other
 *      War Room cache. Reload the War Room page after.
 *
 * Note: schedule_config (cron schedules) is re-seeded automatically
 * by initSchema() on first getDb() call after the wipe — your cron
 * jobs will have their default cadence again.
 */

import path from "node:path";
import fs from "node:fs";

const CONFIRM = process.argv.includes("--confirm");
const DATA_DIR = path.join(process.cwd(), "data");

interface DeletionTarget {
  path: string;
  kind: "file" | "dir-children";
  filter?: (name: string) => boolean;
}

const TARGETS: DeletionTarget[] = [
  { path: path.join(DATA_DIR, "represent-me.db"), kind: "file" },
  { path: path.join(DATA_DIR, "represent-me.db-shm"), kind: "file" },
  { path: path.join(DATA_DIR, "represent-me.db-wal"), kind: "file" },
  // Tailored resumes the resume agent writes via pdf-lib. ONLY files
  // matching the generated patterns (`resume-…`, `test-…`, `tailored-…`)
  // — this preserves master / source PDFs (e.g. SalahNahedResume.pdf)
  // that the pdf-service uses as the overlay template.
  {
    path: path.join(DATA_DIR, "resumes"),
    kind: "dir-children",
    filter: (name) =>
      name.endsWith(".pdf") &&
      (name.startsWith("resume-") ||
        name.startsWith("test-") ||
        name.startsWith("tailored-")),
  },
  // Any orphan generated PDFs sitting in data/ root.
  {
    path: DATA_DIR,
    kind: "dir-children",
    filter: (name) =>
      name.endsWith(".pdf") &&
      (name.startsWith("resume-") ||
        name.startsWith("test-") ||
        name.startsWith("tailored-") ||
        /-cv-/i.test(name)),
  },
];

function fileSize(p: string): number {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

interface PlannedDeletion {
  path: string;
  size: number;
}

function plan(): PlannedDeletion[] {
  const out: PlannedDeletion[] = [];
  for (const t of TARGETS) {
    if (t.kind === "file") {
      if (fs.existsSync(t.path)) {
        out.push({ path: t.path, size: fileSize(t.path) });
      }
    } else {
      // dir-children
      if (!fs.existsSync(t.path)) continue;
      const entries = fs.readdirSync(t.path, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isFile()) continue;
        if (t.filter && !t.filter(e.name)) continue;
        const full = path.join(t.path, e.name);
        out.push({ path: full, size: fileSize(full) });
      }
    }
  }
  return out;
}

function execute(targets: PlannedDeletion[]): { deleted: number; failed: number } {
  let deleted = 0;
  let failed = 0;
  for (const t of targets) {
    try {
      fs.unlinkSync(t.path);
      deleted++;
    } catch (err) {
      console.error(`  ✗ failed: ${t.path}`, err instanceof Error ? err.message : err);
      failed++;
    }
  }
  return { deleted, failed };
}

function main() {
  const targets = plan();

  console.log("\n💣 NUCLEAR WIPE — preview\n");
  if (targets.length === 0) {
    console.log("  Nothing to delete. Data dir is already clean.\n");
    return;
  }

  let total = 0;
  for (const t of targets) {
    console.log(`  ${t.path}  (${humanBytes(t.size)})`);
    total += t.size;
  }
  console.log(`\n  Total: ${targets.length} file(s), ${humanBytes(total)}`);

  if (!CONFIRM) {
    console.log(
      "\n⚠️  This will delete the ENTIRE database + all generated PDFs."
    );
    console.log("   Every seen_jobs row, manual_lead, generated_content,");
    console.log("   activity log entry, and tailored resume will be GONE.\n");
    console.log("   schedule_config will be re-seeded with defaults on the");
    console.log("   next dev-server start.\n");
    console.log("   Re-run with --confirm to proceed:");
    console.log("     npx tsx scripts/wipe-everything.ts --confirm\n");
    return;
  }

  // Sanity check: if the dev server is running it holds the SQLite
  // file handle and unlink will fail on some filesystems. We just
  // try and report — the user gets a clear error if so.
  console.log("\n💥 Wiping...\n");
  const result = execute(targets);
  console.log(`\n  ✅ Deleted: ${result.deleted}`);
  if (result.failed > 0) {
    console.log(`  ✗ Failed:  ${result.failed}`);
    console.log("\n  If failures look like 'EBUSY' or 'ENOENT', stop");
    console.log("  `npm run dev` first (it's holding the DB file open),");
    console.log("  then re-run this script.\n");
  } else {
    console.log("\n📌 Next steps:");
    console.log(
      "  1. Restart `npm run dev` (it cached the DB handle on the running process)."
    );
    console.log("  2. In your browser DevTools Console:");
    console.log(
      `     for (const k of Object.keys(localStorage)) if (k.startsWith("warroom.")) localStorage.removeItem(k);`
    );
    console.log(
      "  3. Reload the War Room. Schema rebuilds empty; cron seeds re-apply.\n"
    );
  }
}

main();
