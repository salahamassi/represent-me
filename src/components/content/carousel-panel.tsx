"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { GeneratedContent } from "@/types";

/**
 * Carousel panel — sits on every LinkedIn content card. Three states:
 *
 *   - none      → big primary button to generate
 *   - ready     → thumbnail strip + download button + regenerate/delete
 *   - working   → spinner + status text (covers generate/regenerate/delete)
 *
 * Local state only. The card-level store doesn't track carousel state
 * because it's per-row and rarely cross-card-relevant.
 */

interface CarouselSummary {
  pdfUrl: string;
  slideCount: number;
  brandId: string | null;
}

function summaryFromContent(content: GeneratedContent): CarouselSummary | null {
  if (!content.carousel_pdf_url) return null;
  let slideCount = 0;
  if (content.carousel_deck_json) {
    try {
      const parsed = JSON.parse(content.carousel_deck_json) as {
        slides?: unknown[];
      };
      if (Array.isArray(parsed.slides)) slideCount = parsed.slides.length;
    } catch {
      slideCount = 0;
    }
  }
  return {
    pdfUrl: content.carousel_pdf_url,
    slideCount,
    brandId: content.carousel_brand_id ?? null,
  };
}

export function CarouselPanel({ content }: { content: GeneratedContent }) {
  const [summary, setSummary] = useState<CarouselSummary | null>(() =>
    summaryFromContent(content)
  );
  /** "generate" while the first POST is in flight; "regenerate" / "delete"
   *  while their flows are in flight. `null` means idle. */
  const [pending, setPending] = useState<
    "generate" | "regenerate" | "delete" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  /** Per-render epoch — bumped on regenerate so the thumbnail strip
   *  busts the browser cache when a new deck overwrites the old PNGs. */
  const [cacheBust, setCacheBust] = useState<number>(() => Date.now());

  const handleGenerate = async (regenerate = false) => {
    if (pending) return;
    setPending(regenerate ? "regenerate" : "generate");
    setError(null);
    try {
      const url = `/api/content/${content.id}/carousel${regenerate ? "?regenerate=true" : ""}`;
      const res = await fetch(url, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `Generation failed (${res.status})`);
        return;
      }
      const slideCount =
        typeof data.slides === "number" ? data.slides : summary?.slideCount || 4;
      setSummary({
        pdfUrl: data.pdfUrl,
        slideCount,
        brandId: data.brandId ?? null,
      });
      setCacheBust(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  };

  const handleDelete = async () => {
    if (pending) return;
    if (!confirm("Delete this carousel? You can regenerate it later.")) return;
    setPending("delete");
    setError(null);
    try {
      const res = await fetch(`/api/content/${content.id}/carousel`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || `Delete failed (${res.status})`);
        return;
      }
      setSummary(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  };

  const handleDownload = async () => {
    if (!summary?.pdfUrl) return;
    try {
      const res = await fetch(summary.pdfUrl);
      if (!res.ok) {
        setError(`Download failed (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `carousel-${content.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Carousel
        </span>
        {summary && pending !== "delete" && (
          <div className="flex gap-1">
            <button
              onClick={() => handleGenerate(true)}
              disabled={!!pending}
              className="rounded px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="Re-prompt Claude and re-render the PDF"
            >
              {pending === "regenerate" ? "Regenerating…" : "Regenerate"}
            </button>
            <button
              onClick={handleDelete}
              disabled={!!pending}
              className="rounded px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-red-400 disabled:opacity-50"
              title="Clear the deck JSON, the PDF, and the thumbnails"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {!summary && (
        <button
          onClick={() => handleGenerate(false)}
          disabled={!!pending}
          className={cn(
            "w-full rounded-md bg-cyan-600/20 px-3 py-2 text-xs font-medium text-cyan-200 transition-colors hover:bg-cyan-600/30 disabled:opacity-50"
          )}
          title="Layla drafts a 4-slide deck from this post and renders it as a PDF"
        >
          {pending === "generate"
            ? "Generating carousel…"
            : "Generate Carousel (4 slides)"}
        </button>
      )}

      {summary && (
        <>
          <ThumbnailStrip
            contentId={content.id}
            count={summary.slideCount || 4}
            cacheBust={cacheBust}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground/70">
              {summary.slideCount || 4} slides
              {summary.brandId ? ` · brand: ${summary.brandId}` : ""}
            </span>
            <button
              onClick={handleDownload}
              className="rounded-md bg-emerald-600/20 px-3 py-1 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-600/30"
            >
              Download PDF
            </button>
          </div>
        </>
      )}

      {error && (
        <p className="text-[11px] text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ThumbnailStrip({
  contentId,
  count,
  cacheBust,
}: {
  contentId: number;
  count: number;
  cacheBust: number;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto py-1">
      {Array.from({ length: count }, (_, i) => {
        const page = i + 1;
        const src = `/api/content/${contentId}/carousel/preview/${page}?v=${cacheBust}`;
        return (
          <a
            key={page}
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="block shrink-0"
            title={`Slide ${page} (open full-size in new tab)`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`Slide ${page}`}
              className="h-32 w-auto rounded border border-border bg-muted/30 transition-transform hover:scale-[1.02]"
              loading="lazy"
            />
          </a>
        );
      })}
    </div>
  );
}
