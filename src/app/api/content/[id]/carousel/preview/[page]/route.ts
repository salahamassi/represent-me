/**
 * Per-slide PNG preview — serves a single rendered carousel slide as
 * an image. Used by the content card's thumbnail strip; cheap because
 * the PNG was written to disk during the POST flow.
 *
 *   GET /api/content/:id/carousel/preview/:page
 *
 * Returns 404 when no carousel exists for the row (or the file went
 * missing after a manual data wipe). The UI hides the thumbnail strip
 * unless the row's `carousel_pdf_url` column is set, so a 404 here is
 * a stale-state edge case, not the common path.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

function carouselThumbPath(contentId: number, page: number): string {
  return path.join(
    process.cwd(),
    "data",
    "carousels",
    `${contentId}-page-${page}.png`
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; page: string }> }
) {
  const { id, page } = await params;
  const contentId = Number(id);
  const pageNum = Number(page);
  if (!Number.isFinite(contentId) || contentId < 1) {
    return new Response("Invalid content id", { status: 400 });
  }
  if (!Number.isFinite(pageNum) || pageNum < 1 || pageNum > 6) {
    return new Response("Invalid page number (1-6)", { status: 400 });
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(carouselThumbPath(contentId, pageNum));
  } catch {
    return new Response("Slide PNG not found — POST the carousel first", {
      status: 404,
    });
  }

  // Node 20's `Buffer<ArrayBufferLike>` doesn't satisfy DOM's
  // `BlobPart` typing — runtime accepts it fine (Buffer is a Uint8Array
  // subclass, which IS a valid BlobPart), but TS's strict types
  // disagree. Cast through unknown rather than `any`.
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: "image/png",
  });
  return new Response(blob, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(bytes.byteLength),
      // Browsers can hold these through a session — POST/DELETE bust
      // the cache by changing the underlying file (overwrite or 404).
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
