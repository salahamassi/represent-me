/**
 * Profile PDF export — generates a fresh CV PDF directly from profile.ts.
 *
 * Implementation note: under Next.js / turbopack, `process.cwd()` is
 * sandboxed to "/ROOT" which makes pdfkit's internal AFM font loading
 * fail (ENOENT on /ROOT/node_modules/pdfkit/js/data/Helvetica.afm). The
 * fix — same as the job-tailored resume generator — is to spawn a
 * separate Node process running scripts/generate-profile-pdf.js that
 * sees the real cwd. The script writes to a temp file; we read it back
 * into a Buffer and delete the temp.
 */

import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { profile } from "@/data/profile";
import { profileATS } from "@/data/profile-ats";

/**
 * Resolve the project root by walking up from this file until we find
 * package.json. Avoids process.cwd() which turbopack sandboxes.
 */
function findProjectRoot(): string {
  // __dirname won't exist in ESM, but Next compiles to CJS-compatible
  // runtime — fall back to cwd if it's somehow missing.
  const startDir =
    (typeof __dirname === "string" && __dirname) || process.cwd();
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (
      fs.existsSync(path.join(dir, "package.json")) &&
      fs.existsSync(path.join(dir, "scripts", "generate-profile-pdf.js"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/**
 * @param ats  When true, uses the compressed `profileATS` view and signals
 *             the child script to skip the avatar (ATS parsers can choke
 *             on images in headers). Default false = full CV view.
 */
export async function generateProfilePDF(
  options: { ats?: boolean } = {}
): Promise<Buffer> {
  const { ats = false } = options;
  const projectRoot = findProjectRoot();
  const scriptPath = path.join(
    projectRoot,
    "scripts",
    "generate-profile-pdf.js"
  );

  // Write the profile snapshot to a temp JSON so the child process has
  // the exact same data we see. Using tmpdir avoids polluting the repo.
  const tmpDir = os.tmpdir();
  const stamp = Date.now();
  const profileJsonPath = path.join(tmpDir, `profile-${stamp}.json`);
  const pdfPath = path.join(tmpDir, `profile-${stamp}.pdf`);

  // Source data + ATS flag are co-located in the JSON so the child
  // script has everything it needs to render either variant.
  const payload = {
    profile: ats ? profileATS : profile,
    ats,
  };
  fs.writeFileSync(profileJsonPath, JSON.stringify(payload));

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("node", [scriptPath, pdfPath, profileJsonPath], {
        cwd: projectRoot,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      child.stderr.on("data", (c) => (stderr += c.toString()));
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `generate-profile-pdf exited with code ${code}: ${stderr || "(no stderr)"}`
            )
          );
        }
      });
    });

    const buf = fs.readFileSync(pdfPath);
    return buf;
  } finally {
    // Clean up temps regardless of success — these files are never reused.
    try {
      fs.unlinkSync(profileJsonPath);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(pdfPath);
    } catch {
      /* ignore */
    }
  }
}
