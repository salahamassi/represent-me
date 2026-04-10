#!/usr/bin/env node
/**
 * PDF Resume Overlay — Replaces the SUMMARY section in Salah's original resume
 * using pdf-lib. Keeps the original design, only changes text content.
 *
 * Usage: node scripts/overlay-pdf.js <inputPdf> <outputPdf> <jsonDataPath>
 *
 * jsonData: { summary: "new summary text" }
 */

const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const fs = require("fs");

const inputPath = process.argv[2];
const outputPath = process.argv[3];
const jsonDataPath = process.argv[4];

if (!inputPath || !outputPath || !jsonDataPath) {
  console.error(JSON.stringify({ success: false, error: "Usage: node overlay-pdf.js <input> <output> <jsonData>" }));
  process.exit(1);
}

async function main() {
  const data = JSON.parse(fs.readFileSync(jsonDataPath, "utf-8"));
  const pdfBytes = fs.readFileSync(inputPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  const page1 = pdfDoc.getPages()[0];
  const { width, height } = page1.getSize();

  // Embed fonts
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // === SUMMARY SECTION COORDINATES ===
  // Based on the original resume layout (A4: 595.92 x 842.88)
  // The left column is roughly x: 28 to x: 370
  // Summary text starts around y: 655 and ends around y: 555
  // (PDF y=0 is at bottom, so higher y = higher on page)

  const summaryBox = {
    x: 26,
    y: 490,       // bottom of summary area
    width: 342,   // left column width (stop before right column)
    height: 200,  // height covers all old summary text including first line
  };

  if (data.summary) {
    // 1. White-out the old summary text
    page1.drawRectangle({
      x: summaryBox.x,
      y: summaryBox.y,
      width: summaryBox.width,
      height: summaryBox.height,
      color: rgb(1, 1, 1), // White
    });

    // 2. Write new summary text
    const fontSize = 8.5;
    const lineHeight = 12;
    const maxWidth = summaryBox.width - 20;

    // Word wrap the summary text
    const words = data.summary.split(" ");
    const lines = [];
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? currentLine + " " + word : word;
      const testWidth = helvetica.widthOfTextAtSize(testLine, fontSize);
      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    // Draw each line from top of summary box downward
    let yPos = summaryBox.y + summaryBox.height - 5;
    for (const line of lines) {
      if (yPos < summaryBox.y) break; // Don't overflow
      page1.drawText(line, {
        x: summaryBox.x + 2,
        y: yPos,
        size: fontSize,
        font: helvetica,
        color: rgb(0.12, 0.12, 0.12), // Dark gray matching original
      });
      yPos -= lineHeight;
    }
  }

  // Save
  const outputBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, outputBytes);

  console.log(JSON.stringify({
    success: true,
    path: outputPath,
    size: outputBytes.length,
  }));
}

main().catch((err) => {
  console.log(JSON.stringify({ success: false, error: err.message }));
});
