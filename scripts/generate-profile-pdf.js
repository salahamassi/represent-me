#!/usr/bin/env node
/**
 * Standalone profile-CV PDF generator. Called from the Next.js API route
 * via child_process so pdfkit can load its AFM font data from the real
 * filesystem — Next.js / turbopack sandboxes `process.cwd()` to "/ROOT"
 * at request time, which breaks pdfkit's internal font resolution.
 *
 * Invocation: node scripts/generate-profile-pdf.js <outputPdfPath> <profileJsonPath>
 *
 * The profile JSON is expected to be the exported object from
 * src/data/profile.ts. The API route writes a temp JSON file, calls this
 * script, then streams the resulting PDF back to the client.
 */

const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const outputPath = process.argv[2];
const profileJsonPath = process.argv[3];

if (!outputPath || !profileJsonPath) {
  console.error("Usage: node scripts/generate-profile-pdf.js <output.pdf> <profile.json>");
  process.exit(1);
}

// Payload shape: { profile, ats }. Backward-compatible: if the file is
// just a profile object (older callers), treat it as { profile, ats: false }.
const raw = JSON.parse(fs.readFileSync(profileJsonPath, "utf8"));
const payload =
  raw && typeof raw === "object" && "profile" in raw
    ? raw
    : { profile: raw, ats: false };
const profile = payload.profile;
const ATS_MODE = !!payload.ats;

// Colors matched to the original CV PDF
const HEADER_BLUE = "#2563eb";
const TEXT_DARK = "#1f2937";
const TEXT_MUTED = "#6b7280";
const DIVIDER = "#e5e7eb";
const LINK_BLUE = "#2563eb";

const AVATAR_SIZE = 80;

const PROJECT_ROOT = path.resolve(__dirname, "..");
const AVATAR_PATH = path.join(PROJECT_ROOT, "public", "salah-avatar.jpg");

function sectionTitle(doc, title) {
  doc.moveDown(0.6);
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(HEADER_BLUE)
    .text(title.toUpperCase(), { characterSpacing: 0.8 });
  const y = doc.y + 2;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  doc
    .strokeColor(DIVIDER)
    .lineWidth(0.8)
    .moveTo(left, y)
    .lineTo(right, y)
    .stroke();
  doc.moveDown(0.4);
}

function checkPageBreak(doc, needed) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 44, bottom: 44, left: 50, right: 50 },
  info: {
    Title: `${profile.name} — CV`,
    Author: profile.name,
    Subject: profile.role,
  },
});

const stream = fs.createWriteStream(outputPath);
doc.pipe(stream);

const pageWidth =
  doc.page.width - doc.page.margins.left - doc.page.margins.right;

// --- Header ---
// ATS mode: single-column, no avatar (image parsers in Workday / Greenhouse
// / Lever occasionally strip the surrounding text block along with the
// image). Full mode: name + contact on the left, avatar on the right.
const headerTop = doc.y;

if (ATS_MODE) {
  // Single-column text header, full width.
  doc
    .font("Helvetica-Bold")
    .fontSize(26)
    .fillColor(TEXT_DARK)
    .text(profile.name.toUpperCase(), doc.page.margins.left, headerTop, {
      width: pageWidth,
    });

  doc
    .font("Helvetica")
    .fontSize(10.5)
    .fillColor(HEADER_BLUE)
    .text(profile.role, { width: pageWidth });

  doc.moveDown(0.4);

  const contactLine = [
    profile.phone,
    profile.email,
    profile.links.linkedin,
    profile.links.github,
    profile.location,
  ]
    .filter(Boolean)
    .join("  |  ");

  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(LINK_BLUE)
    .text(contactLine, { width: pageWidth });

  doc.x = doc.page.margins.left;
  doc.moveDown(0.3);
} else {
  const rightColumnX = doc.page.width - doc.page.margins.right - AVATAR_SIZE;
  const leftColWidth = pageWidth - AVATAR_SIZE - 20;

  if (fs.existsSync(AVATAR_PATH)) {
    doc.save();
    doc.roundedRect(rightColumnX, headerTop, AVATAR_SIZE, AVATAR_SIZE, 8).clip();
    doc.image(AVATAR_PATH, rightColumnX, headerTop, {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
    });
    doc.restore();
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(26)
    .fillColor(TEXT_DARK)
    .text(profile.name.toUpperCase(), doc.page.margins.left, headerTop, {
      width: leftColWidth,
    });

  doc
    .font("Helvetica")
    .fontSize(10.5)
    .fillColor(HEADER_BLUE)
    .text(profile.role, doc.page.margins.left, doc.y + 2, {
      width: leftColWidth,
    });

  doc.moveDown(0.4);

  const contactLine1 = [profile.phone, profile.email, profile.links.linkedin]
    .filter(Boolean)
    .join("  |  ");
  const contactLine2 = [profile.links.github, profile.location]
    .filter(Boolean)
    .join("  |  ");

  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(LINK_BLUE)
    .text(contactLine1, doc.page.margins.left, doc.y, { width: leftColWidth })
    .text(contactLine2, { width: leftColWidth });

  const headerBottom = Math.max(doc.y, headerTop + AVATAR_SIZE);
  doc.y = headerBottom;
  doc.x = doc.page.margins.left;
  doc.moveDown(0.3);
}

// --- Summary ---
sectionTitle(doc, "Summary");
doc
  .font("Helvetica")
  .fontSize(9.5)
  .fillColor(TEXT_DARK)
  .text(profile.summary, { lineGap: 2 });

// --- Key Achievements ---
if (profile.keyAchievements && profile.keyAchievements.length > 0) {
  sectionTitle(doc, "Key Achievements");
  for (const a of profile.keyAchievements) {
    checkPageBreak(doc, 50);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(TEXT_DARK).text(a.title);
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(TEXT_DARK)
      .text(a.description, { lineGap: 1.5 });
    doc.moveDown(0.3);
  }
}

// --- AI Integration Highlights ---
if (profile.aiIntegrationHighlights && profile.aiIntegrationHighlights.length > 0) {
  sectionTitle(doc, "AI Integration Highlights");
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(TEXT_DARK)
    .text("Independent / Personal Projects");
  doc.moveDown(0.2);
  for (const h of profile.aiIntegrationHighlights) {
    checkPageBreak(doc, 30);
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(TEXT_DARK)
      .text(`•  ${h}`, { indent: 6, lineGap: 1.5, paragraphGap: 3 });
  }
}

// --- Experience ---
sectionTitle(doc, "Experience");
for (const exp of profile.experience) {
  checkPageBreak(doc, 90);
  const titleSuffix =
    exp.employmentType && exp.employmentType !== "full-time"
      ? `  (${exp.employmentType})`
      : "";
  doc
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .fillColor(TEXT_DARK)
    .text(exp.title + titleSuffix);
  doc
    .font("Helvetica-Oblique")
    .fontSize(9)
    .fillColor(TEXT_MUTED)
    .text(`${exp.company} · ${exp.period} · ${exp.location}`);
  doc.moveDown(0.2);

  if (exp.description) {
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(TEXT_DARK)
      .text(exp.description, { lineGap: 1.5 });
  }
  for (const h of exp.highlights) {
    checkPageBreak(doc, 20);
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(TEXT_DARK)
      .text(`•  ${h}`, { indent: 6, lineGap: 1.5, paragraphGap: 2 });
  }
  doc.moveDown(0.4);
}

// --- Skills ---
sectionTitle(doc, "Skills");
for (const group of profile.skills) {
  checkPageBreak(doc, 30);
  doc
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .fillColor(TEXT_DARK)
    .text(group.category + ": ", { continued: true })
    .font("Helvetica")
    .fillColor(TEXT_DARK)
    .text(group.items.join(" · "), { lineGap: 1.5 });
  doc.moveDown(0.15);
}

// --- Open Source ---
if (profile.openSource && profile.openSource.length > 0) {
  sectionTitle(doc, "Open Source & Creator");
  for (const os of profile.openSource) {
    checkPageBreak(doc, 36);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(TEXT_DARK).text(os.name);
    if (os.url) {
      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor(LINK_BLUE)
        .text(os.url, { link: os.url, underline: true });
    }
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(TEXT_DARK)
      .text(os.description, { lineGap: 1.5 });
    doc.moveDown(0.3);
  }
}

// --- Publications ---
// Each entry renders as: bold title, then a muted "platform · date"
// line, then the URL as a clickable link in blue (mirrors the Open
// Source section's style). Falls back to a single-line bullet when no
// URL is present.
if (profile.publications && profile.publications.length > 0) {
  sectionTitle(doc, "Publications");
  for (const pub of profile.publications) {
    checkPageBreak(doc, 32);
    if (pub.url) {
      doc.font("Helvetica-Bold").fontSize(10).fillColor(TEXT_DARK).text(pub.title);
      const meta = [pub.platform, pub.date].filter(Boolean).join(" · ");
      if (meta) {
        doc
          .font("Helvetica-Oblique")
          .fontSize(9)
          .fillColor(TEXT_MUTED)
          .text(meta);
      }
      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor(LINK_BLUE)
        .text(pub.url, { link: pub.url, underline: true });
      doc.moveDown(0.3);
    } else {
      const line = [pub.title, pub.platform, pub.date].filter(Boolean).join(" · ");
      doc
        .font("Helvetica")
        .fontSize(9.5)
        .fillColor(TEXT_DARK)
        .text(`•  ${line}`, { indent: 6, lineGap: 1.5 });
    }
  }
}

// --- Education ---
if (profile.education && profile.education.length > 0) {
  sectionTitle(doc, "Education");
  for (const edu of profile.education) {
    checkPageBreak(doc, 30);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(TEXT_DARK).text(edu.degree);
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(TEXT_MUTED)
      .text(`${edu.institution} · ${edu.period}`);
  }
}

doc.end();

stream.on("finish", () => {
  process.exit(0);
});
stream.on("error", (err) => {
  console.error("stream error:", err);
  process.exit(1);
});
