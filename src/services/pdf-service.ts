/**
 * PDF Resume Generator — Creates professional PDF resumes using pdfkit.
 *
 * Implementation note: under Next.js / turbopack, `process.cwd()` is
 * sandboxed to "/ROOT" and pdfkit's internal AFM font loading fails
 * (ENOENT on /ROOT/node_modules/pdfkit/js/data/Helvetica.afm). We solve
 * it the same way `profile-pdf-service` does: shell out to the
 * standalone script `scripts/generate-pdf.js`, which runs under a real
 * Node cwd and sees the real filesystem. The script accepts a JSON
 * payload with `{ resume, profile, jobTitle }` and writes to a path.
 *
 * The in-process pdfkit code further down in this module is retained
 * for reference only — it's unused at runtime. Delete it once we're
 * confident the child-process path is stable.
 */

import { spawn } from "child_process";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { ResumeGeneration } from "@/agents/schemas/resume-gen.schema";
import { profile } from "@/data/profile";

// Resolve paths — try multiple locations for Next.js compatibility.
// Turbopack dev mode reports `process.cwd() === "/ROOT"` which does not
// exist on disk, so the cwd-based candidates all miss. We add an
// `import.meta.url` fallback: this file lives at
// `<project>/src/services/pdf-service.ts`, so climbing three levels
// from its directory always lands us on the real project root.
function findProjectRoot(): string {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
  ];
  try {
    const here = fileURLToPath(import.meta.url);
    candidates.push(path.resolve(path.dirname(here), "..", "..", ".."));
  } catch {
    // Not ESM or no import.meta — the cwd candidates are our only hope.
  }
  for (const dir of candidates) {
    if (
      fs.existsSync(path.join(dir, "package.json")) &&
      fs.existsSync(path.join(dir, "node_modules", "pdfkit"))
    ) {
      return dir;
    }
  }
  return process.cwd();
}

// Under turbopack both `process.cwd()` and `import.meta.url` can resolve
// to a virtual `/ROOT` path that doesn't exist on disk, which left
// pdfkit unable to find its bundled fonts. Use `require.resolve` to
// ask Node for the real on-disk location of pdfkit — that's sandbox-
// proof because Node resolves from its actual module search paths —
// then derive both FONT_DIR and PROJECT_ROOT from there.
function resolvePdfkitRoot(): string | null {
  try {
    const req = eval("require") as NodeJS.Require;
    const pkgJson = req.resolve("pdfkit/package.json");
    return path.dirname(pkgJson); // <repo>/node_modules/pdfkit
  } catch {
    return null;
  }
}

const PDFKIT_ROOT = resolvePdfkitRoot();
const PROJECT_ROOT = PDFKIT_ROOT
  ? path.resolve(PDFKIT_ROOT, "..", "..") // pdfkit → node_modules → <repo>
  : findProjectRoot();
const FONT_DIR = PDFKIT_ROOT
  ? path.join(PDFKIT_ROOT, "js", "data")
  : path.join(PROJECT_ROOT, "node_modules", "pdfkit", "js", "data");
const RESUME_DIR = path.join(PROJECT_ROOT, "data", "resumes");

// Colors
const PRIMARY = "#1a1a2e";
const ACCENT = "#16a34a";
const TEXT = "#1f2937";
const MUTED = "#6b7280";
const DIVIDER = "#d1d5db";

function ensureDir() {
  if (!fs.existsSync(RESUME_DIR)) {
    fs.mkdirSync(RESUME_DIR, { recursive: true });
  }
}

export async function generateResumePDF(
  resumeData: ResumeGeneration,
  jobId: string,
  jobTitle: string
): Promise<string> {
  ensureDir();

  const timestamp = Date.now();
  const safeName = jobTitle.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 50);
  const filename = `resume-${safeName}-${timestamp}.pdf`;
  const outputPath = path.join(RESUME_DIR, filename);

  // Delegate to the standalone `scripts/generate-pdf.js` — runs in a
  // real Node cwd so pdfkit can find its bundled fonts. Write the
  // payload to a temp JSON file and spawn the child with the output
  // path as an argument. Same pattern as profile-pdf-service.ts.
  const scriptPath = path.join(PROJECT_ROOT, "scripts", "generate-pdf.js");
  const jsonPath = path.join(
    PROJECT_ROOT,
    "data",
    `_resume-payload-${timestamp}.json`
  );
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ resume: resumeData, profile, jobTitle })
  );

  await new Promise<void>((resolve, reject) => {
    const child = spawn("node", [scriptPath, outputPath, jsonPath], {
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("error", reject);
    child.on("exit", (code) => {
      // Clean up the temp payload regardless — it has no secrets but
      // we don't want them piling up in `data/`.
      try { fs.unlinkSync(jsonPath); } catch { /* ignore */ }
      if (code === 0) resolve();
      else reject(new Error(`generate-pdf.js exited ${code}: ${stderr || "(no stderr)"}`));
    });
  });

  return outputPath;
}

/**
 * Legacy in-process PDF generator — kept for reference, not wired up.
 * Fails under turbopack because pdfkit reads .afm files from
 * node_modules using `process.cwd()`-relative paths.
 */
async function _generateResumePDFInProcess(
  resumeData: ResumeGeneration,
  jobId: string,
  jobTitle: string
): Promise<string> {
  ensureDir();

  const timestamp = Date.now();
  const safeName = jobTitle.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 50);
  const filename = `resume-${safeName}-${timestamp}.pdf`;
  const outputPath = path.join(RESUME_DIR, filename);

  // jobId currently unused in the in-process path — kept in the
  // signature for symmetry with the primary generator.
  void jobId;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, bottom: 40, left: 50, right: 50 },
    });

    // pdfkit ships with Helvetica / Helvetica-Bold / Helvetica-Oblique
    // as built-in standard fonts — we don't need to register them from
    // on-disk .afm files. Registering explicit paths breaks under
    // turbopack (process.cwd() === "/ROOT") and isn't necessary for
    // these standard PDF core fonts. Leaving the variables above for
    // future custom-font work.

    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // --- Header ---
    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .fillColor(PRIMARY)
      .text(profile.name, { align: "center" });

    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor(ACCENT)
      .text(resumeData.targetRole, { align: "center" });

    doc.moveDown(0.3);

    // Contact line
    const contactParts = [
      profile.email,
      profile.phone,
      profile.location,
      profile.links.github,
      profile.links.linkedin,
    ].filter(Boolean);

    doc
      .fontSize(8)
      .fillColor(MUTED)
      .text(contactParts.join("  |  "), { align: "center" });

    drawDivider(doc, pageWidth);

    // --- Summary ---
    sectionTitle(doc, "SUMMARY");
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(TEXT)
      .text(resumeData.summary, { lineGap: 2 });

    drawDivider(doc, pageWidth);

    // --- Experience ---
    sectionTitle(doc, "EXPERIENCE");

    for (const entry of resumeData.experienceEntries) {
      checkPageBreak(doc, 80);

      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(PRIMARY)
        .text(entry.title, { continued: true })
        .font("Helvetica")
        .fillColor(MUTED)
        .text(`  —  ${entry.company}`, { continued: true })
        .text(`  (${entry.period})`);

      doc.moveDown(0.2);

      for (const bullet of entry.bullets) {
        checkPageBreak(doc, 15);
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor(TEXT)
          .text(`•  ${bullet}`, {
            indent: 10,
            lineGap: 1.5,
          });
      }

      if (entry.technologies.length > 0) {
        doc
          .font("Helvetica-Oblique")
          .fontSize(8)
          .fillColor(MUTED)
          .text(`Tech: ${entry.technologies.join(", ")}`, { indent: 10 });
      }

      doc.moveDown(0.5);
    }

    drawDivider(doc, pageWidth);

    // --- Skills ---
    sectionTitle(doc, "SKILLS");

    for (const group of resumeData.skillsGrouped) {
      checkPageBreak(doc, 15);
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(PRIMARY)
        .text(`${group.category}: `, { continued: true })
        .font("Helvetica")
        .fillColor(TEXT)
        .text(group.items.join(", "));
    }

    drawDivider(doc, pageWidth);

    // --- Projects ---
    if (resumeData.highlightedProjects.length > 0) {
      sectionTitle(doc, "HIGHLIGHTED PROJECTS");

      for (const project of resumeData.highlightedProjects) {
        checkPageBreak(doc, 20);
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor(PRIMARY)
          .text(project.name, { continued: true })
          .font("Helvetica")
          .fillColor(TEXT)
          .text(`  —  ${project.description}`);
        // v3 — Render the public URL on the next line in muted italic
        // when present. Uses pdfkit's `link` so the URL is clickable
        // in any conformant PDF reader.
        if (project.url) {
          doc
            .font("Helvetica-Oblique")
            .fontSize(8)
            .fillColor(MUTED)
            .text(project.url, { link: project.url, underline: false });
        }
      }

      drawDivider(doc, pageWidth);
    }

    // --- Education ---
    sectionTitle(doc, "EDUCATION");

    for (const edu of resumeData.education) {
      doc
        .font("Helvetica-Bold")
        .fontSize(9.5)
        .fillColor(PRIMARY)
        .text(edu.degree, { continued: true })
        .font("Helvetica")
        .fillColor(MUTED)
        .text(`  —  ${edu.institution}  (${edu.period})`);
    }

    // --- Footer ---
    doc.moveDown(1);
    doc
      .font("Helvetica-Oblique")
      .fontSize(7)
      .fillColor(MUTED)
      .text(`Tailored for: ${jobTitle}`, { align: "center" });

    doc.end();

    stream.on("finish", () => {
      console.log(`[PDF] Resume generated: ${outputPath}`);
      resolve(outputPath);
    });

    stream.on("error", reject);
  });
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string) {
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(ACCENT)
    .text(title);
  doc.moveDown(0.3);
}

function drawDivider(doc: PDFKit.PDFDocument, width: number) {
  doc.moveDown(0.3);
  const y = doc.y;
  doc
    .strokeColor(DIVIDER)
    .lineWidth(0.5)
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.margins.left + width, y)
    .stroke();
  doc.moveDown(0.4);
}

function checkPageBreak(doc: PDFKit.PDFDocument, neededSpace: number) {
  if (doc.y + neededSpace > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}
