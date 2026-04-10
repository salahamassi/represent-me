/**
 * PDF Resume Generator — Creates professional PDF resumes using pdfkit.
 */

import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import type { ResumeGeneration } from "@/agents/schemas/resume-gen.schema";
import { profile } from "@/data/profile";

// Resolve paths — try multiple locations for Next.js compatibility
function findProjectRoot(): string {
  // Try process.cwd() first, then walk up from this file
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "package.json")) && fs.existsSync(path.join(dir, "node_modules", "pdfkit"))) {
      return dir;
    }
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const FONT_DIR = path.join(PROJECT_ROOT, "node_modules", "pdfkit", "js", "data");
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

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, bottom: 40, left: 50, right: 50 },
    });

    // Register fonts with absolute paths to fix Next.js resolution
    doc.registerFont("Helvetica", path.join(FONT_DIR, "Helvetica.afm"));
    doc.registerFont("Helvetica-Bold", path.join(FONT_DIR, "Helvetica-Bold.afm"));
    doc.registerFont("Helvetica-Oblique", path.join(FONT_DIR, "Helvetica-Oblique.afm"));

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
