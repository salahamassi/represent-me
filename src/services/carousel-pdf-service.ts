/**
 * Carousel PDF assembly — stitches rendered slide PNGs into a
 * multi-page PDF sized 1080×1350 points per page (matches the slide
 * pixel canvas 1:1 so PDF readers and LinkedIn render the doc with no
 * resampling).
 *
 * Uses `pdf-lib` (already a dep — also used by the resume pipeline)
 * which is pure JS, runs in-process, and embeds PNG buffers without
 * touching the filesystem-sensitive AFM-font lookups that bit
 * `pdf-service.ts`.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import type { RenderedSlide } from "./carousel-renderer";

/** Page dimensions in points. PDF points are 1/72 inch — we match the
 *  pixel canvas at 1080×1350 so each slide fills a logical page
 *  one-to-one. */
const PAGE_WIDTH = 1080;
const PAGE_HEIGHT = 1350;

export interface CarouselPdfOptions {
  /** Optional metadata embedded in the PDF — shows up in LinkedIn's
   *  doc viewer and in standalone readers. */
  title?: string;
  author?: string;
}

export interface AssembledCarouselPdf {
  /** Absolute path the PDF was written to. */
  path: string;
  /** Bytes written. */
  byteLength: number;
}

/**
 * Build a PDF from rendered slides and write it to `outPath`.
 *
 * Slides are embedded in their `index` order, regardless of the array
 * order — guards against a future caller passing slides out of
 * sequence.
 *
 * Throws if `outPath`'s parent directory can't be created or the
 * write fails. PDF library errors propagate unwrapped.
 */
export async function assembleCarouselPdf(
  slides: RenderedSlide[],
  outPath: string,
  options: CarouselPdfOptions = {}
): Promise<AssembledCarouselPdf> {
  if (slides.length === 0) {
    throw new Error("Cannot assemble a PDF with zero slides.");
  }

  const ordered = [...slides].sort((a, b) => a.index - b.index);

  const pdf = await PDFDocument.create();
  if (options.title) pdf.setTitle(options.title);
  if (options.author) pdf.setAuthor(options.author);
  pdf.setProducer("represent-me carousel-pdf-service");
  pdf.setCreator("represent-me");

  for (const slide of ordered) {
    const png = await pdf.embedPng(slide.png);
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawImage(png, {
      x: 0,
      y: 0,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
    });
  }

  const bytes = await pdf.save();
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, bytes);

  return {
    path: outPath,
    byteLength: bytes.byteLength,
  };
}

/**
 * Write per-slide PNGs to disk so the UI's thumbnail strip can serve
 * them without re-running Satori. Files are named
 *   `{outDir}/{idPrefix}-page-{index}.png`
 * with a 1-indexed page number matching `RenderedSlide.index`.
 *
 * Idempotent — overwrites any existing file. Caller owns directory
 * creation conventions; this helper makes the dir if missing.
 */
export async function saveSlidePngs(
  slides: RenderedSlide[],
  outDir: string,
  idPrefix: string
): Promise<{ paths: string[] }> {
  await mkdir(outDir, { recursive: true });
  const ordered = [...slides].sort((a, b) => a.index - b.index);
  const paths: string[] = [];
  for (const slide of ordered) {
    const filePath = path.join(outDir, `${idPrefix}-page-${slide.index}.png`);
    await writeFile(filePath, slide.png);
    paths.push(filePath);
  }
  return { paths };
}
