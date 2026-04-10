#!/usr/bin/env node
/**
 * Standalone PDF resume generator.
 * Called from Next.js API routes via child_process to avoid pdfkit font issues.
 *
 * Usage: node scripts/generate-pdf.js <outputPath> <jsonDataPath>
 */

const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const outputPath = process.argv[2];
const jsonDataPath = process.argv[3];

if (!outputPath || !jsonDataPath) {
  console.error("Usage: node scripts/generate-pdf.js <outputPath> <jsonDataPath>");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(jsonDataPath, "utf-8"));
const { resume, profile, jobTitle } = data;

const PRIMARY = "#1a1a2e";
const ACCENT = "#16a34a";
const TEXT = "#1f2937";
const MUTED = "#6b7280";

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 40, bottom: 40, left: 50, right: 50 },
});

const stream = fs.createWriteStream(outputPath);
doc.pipe(stream);

const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

// --- Header ---
doc.font("Helvetica-Bold").fontSize(22).fillColor(PRIMARY).text(profile.name, { align: "center" });
doc.font("Helvetica").fontSize(11).fillColor(ACCENT).text(resume.targetRole || jobTitle, { align: "center" });
doc.moveDown(0.3);

const contactParts = [profile.email, profile.phone, profile.location].filter(Boolean);
if (profile.links) {
  if (profile.links.github) contactParts.push(profile.links.github);
  if (profile.links.linkedin) contactParts.push(profile.links.linkedin);
}
doc.fontSize(8).fillColor(MUTED).text(contactParts.join("  |  "), { align: "center" });
drawDivider();

// --- Summary ---
sectionTitle("SUMMARY");
doc.font("Helvetica").fontSize(9.5).fillColor(TEXT).text(resume.summary || "", { lineGap: 2 });
drawDivider();

// --- Experience ---
sectionTitle("EXPERIENCE");
const entries = Array.isArray(resume.experienceEntries) ? resume.experienceEntries : [];
for (const entry of entries) {
  checkPageBreak(80);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(PRIMARY)
    .text(`${entry.title || ""} — ${entry.company || ""}`, { continued: false });
  if (entry.period) {
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(entry.period);
  }
  doc.moveDown(0.2);

  const bullets = Array.isArray(entry.bullets) ? entry.bullets : [];
  for (const bullet of bullets) {
    checkPageBreak(15);
    doc.font("Helvetica").fontSize(9).fillColor(TEXT).text(`•  ${bullet}`, { indent: 10, lineGap: 1.5 });
  }

  const techs = Array.isArray(entry.technologies) ? entry.technologies : [];
  if (techs.length > 0) {
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(MUTED).text(`Tech: ${techs.join(", ")}`, { indent: 10 });
  }
  doc.moveDown(0.5);
}
drawDivider();

// --- Skills ---
sectionTitle("SKILLS");
const skillGroups = Array.isArray(resume.skillsGrouped) ? resume.skillsGrouped : (resume.skillsGrouped ? [resume.skillsGrouped] : []);
for (const group of skillGroups) {
  if (!group || !group.category) continue;
  checkPageBreak(15);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(PRIMARY).text(`${group.category}: `, { continued: true });
  doc.font("Helvetica").fillColor(TEXT).text((group.items || []).join(", "));
}
drawDivider();

// --- Projects ---
const projects = Array.isArray(resume.highlightedProjects) ? resume.highlightedProjects : [];
if (projects.length > 0) {
  sectionTitle("PROJECTS");
  for (const p of projects) {
    checkPageBreak(20);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(PRIMARY).text(p.name || "", { continued: true });
    doc.font("Helvetica").fillColor(TEXT).text(`  —  ${p.description || ""}`);
  }
  drawDivider();
}

// --- Education ---
sectionTitle("EDUCATION");
const education = Array.isArray(resume.education) ? resume.education : (resume.education ? [resume.education] : []);
for (const edu of education) {
  if (!edu || !edu.degree) continue;
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(PRIMARY).text(edu.degree, { continued: true });
  doc.font("Helvetica").fillColor(MUTED).text(`  —  ${edu.institution || ""}  (${edu.period || ""})`);
}

// --- Footer ---
doc.moveDown(1);
doc.font("Helvetica-Oblique").fontSize(7).fillColor(MUTED).text(`Tailored for: ${jobTitle}`, { align: "center" });

doc.end();

stream.on("finish", () => {
  console.log(JSON.stringify({ success: true, path: outputPath, size: fs.statSync(outputPath).size }));
});

stream.on("error", (err) => {
  console.log(JSON.stringify({ success: false, error: err.message }));
});

function sectionTitle(title) {
  doc.font("Helvetica-Bold").fontSize(11).fillColor(ACCENT).text(title);
  doc.moveDown(0.3);
}

function drawDivider() {
  doc.moveDown(0.3);
  const y = doc.y;
  doc.strokeColor("#d1d5db").lineWidth(0.5)
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.margins.left + pageWidth, y)
    .stroke();
  doc.moveDown(0.4);
}

function checkPageBreak(needed) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}
