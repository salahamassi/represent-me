/**
 * GET /api/war-room/queue?role=Yusuf|Rashid|Layla|Kareem
 *
 * Returns the top 3 queue items for a persona's workbench. Items are
 * deliberately small + uniformly shaped so the UI can render them with
 * a single component regardless of which agent owns them:
 *
 *   { id, kind, primary, secondary, leadId? }
 *
 * `leadId` is set when the item is backed by a row in `seen_jobs` so
 * the UI can wire the "Open detail" + "Trigger apply chain" affordances
 * straight to the lead record. Items without a leadId (e.g. a Layla
 * draft that was hand-written) only get the chat-brief affordance.
 *
 * Tariq is intentionally unhandled here — his workbench is the live
 * countdown + deadline stack, not a queue. Calling the route with
 * `role=Tariq` returns 400.
 */

import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import {
  getSeenJobs,
  getRecentContent,
  getLatestManualLead,
  getManualLead,
  getDb,
} from "@/lib/db";
import { asPersonaKey } from "@/war-room/personas";

export const runtime = "nodejs";

export interface QueueItem {
  id: string;
  /** What kind of artifact this is — drives the icon + which actions
   *  are available. "job" rows get apply-chain; "draft" rows don't. */
  kind: "job" | "draft" | "audit" | "deadline" | "brief";
  /** Title — shown left-aligned in bold-ish text. */
  primary: string;
  /** Subtitle — shown below in a smaller, dimmer style. */
  secondary: string;
  /** Foreign key into `seen_jobs.id` when applicable. */
  leadId?: string;
  /** Persona-specific lifecycle status — drives in-workbench grouping
   *  ("Drafting" vs "Ready" buckets for Layla, "Approved" badge on
   *  Kareem rows, etc.). Optional; consumers can ignore it. */
  status?: "pending" | "approved" | "drafting" | "ready" | "audited";
  /** Full text of the underlying artifact, inlined when available so
   *  the workbench can preview + copy without a follow-up fetch. Set
   *  for Yusuf's draft-brief item so the supervisor panel can be a
   *  "single pane of glass" for content review. */
  fullText?: string;
  /** Foreign key into `generated_content.id` — present when the item
   *  is backed by a content row. Used by the inline approve action. */
  contentId?: number;
  /** Public URL of Ghada's generated visual when present. Inlined here
   *  so Yusuf's draft preview slab can render the image without a
   *  follow-up fetch — single-pane review. */
  imageUrl?: string;
  /** Phase 7+ carousel artefacts. When `carouselPdfUrl` is set, the
   *  draft preview surfaces the multi-slide deck (and skips Ghada's
   *  single-PNG visual) — the carousel is what actually publishes to
   *  LinkedIn alongside the post text. */
  carouselPdfUrl?: string;
  carouselSlides?: number;
  carouselBrandId?: string;
  /** v3 — when an item is a Yusuf brief tied to a real lead, the
   *  resolved kit URLs are inlined here so the workbench can render
   *  "Resume PDF" + "Cover letter" pills directly under the row.
   *  These were previously surfaced in the global Command Bar; the
   *  minimalist v3 top bar moved them next to the lead they belong
   *  to. Both are absent for items without a kit. */
  resumePath?: string;
  coverPath?: string;
  resumeFilename?: string;
}

/** v3 — lookup the kit (resume PDF + optional cover letter) attached
 *  to a lead so Yusuf's workbench rows can render download pills.
 *  Mirrors the resolution in `/api/war-room/top-lead` exactly so the
 *  two surfaces stay in sync. Returns nulls when no kit exists yet. */
interface ResumeRowMini { pdf_path: string }
function resolveKit(leadId: string): {
  resumePath: string | null;
  coverPath: string | null;
  resumeFilename: string | undefined;
} {
  const db = getDb();
  // Manual leads carry their kit fields on `seen_jobs` itself.
  const manual = getManualLead(leadId);
  if (manual) {
    let resumePath: string | null = null;
    let coverPath: string | null = null;
    let resumeFilename: string | undefined;
    if (manual.kit_status === "kit-ready" && manual.kit_resume_path) {
      resumePath = `/api/manual-lead/${encodeURIComponent(leadId)}/resume`;
      resumeFilename = path.basename(manual.kit_resume_path);
    }
    if (manual.cover_letter_text) {
      coverPath = `/api/manual-lead/${encodeURIComponent(leadId)}/cover`;
    }
    return { resumePath, coverPath, resumeFilename };
  }
  // Scouted job — look in `generated_resumes` for the latest tailored PDF.
  const resume = db
    .prepare(
      `SELECT pdf_path FROM generated_resumes
       WHERE job_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(leadId) as ResumeRowMini | undefined;
  if (resume) {
    const filename = path.basename(resume.pdf_path);
    return {
      resumePath: `/api/jobs/resume?file=${encodeURIComponent(filename)}`,
      coverPath: null,
      resumeFilename: filename,
    };
  }
  return { resumePath: null, coverPath: null, resumeFilename: undefined };
}

interface SeenJobRow {
  id: string;
  title: string | null;
  company: string | null;
  fit_percentage: number | null;
  user_action: string | null;
  ai_analysis: string | null;
  source: string | null;
  first_seen_at: string;
  approval_status: string | null;
}

interface ContentRow {
  id: number;
  content_type: string | null;
  generated_text: string | null;
  user_action: string | null;
  created_at: string;
  image_url: string | null;
  /** Phase 7 — narrative-only post body Layla rewrote alongside the
   *  carousel. Preferred over `generated_text` for everything that
   *  represents "what gets published" (publish flow, draft preview,
   *  Yusuf's review slab). Null on rows without a carousel. */
  carousel_post_text: string | null;
  carousel_pdf_url: string | null;
  carousel_brand_id: string | null;
  /** Stringified deck object — parsed only to derive slide count
   *  for the badge on the workbench. Don't ship the whole thing to
   *  the client. */
  carousel_deck_json: string | null;
}

/** Cheap parse of the deck JSON to get just the slide count. Returns
 *  undefined when the JSON is missing / malformed so callers can
 *  default to "4 slides" downstream. */
function parseSlideCount(deckJson: string | null): number | undefined {
  if (!deckJson) return undefined;
  try {
    const parsed = JSON.parse(deckJson) as { slides?: unknown[] };
    if (Array.isArray(parsed.slides)) return parsed.slides.length;
  } catch {
    // Malformed JSON — treat as no count.
  }
  return undefined;
}

/** Bucket fit % into Rashid's lexicon: hot ≥85, warm 70–84, cold <70. */
function tempBucket(fit: number | null): string {
  if (fit == null) return "unscored";
  if (fit >= 85) return "hot";
  if (fit >= 70) return "warm";
  return "cold";
}

/** Word count for a draft preview line — quick heuristic, no parser. */
function wordCount(s: string | null): number {
  if (!s) return 0;
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export async function GET(req: NextRequest) {
  const role = req.nextUrl.searchParams.get("role") || "";
  const personaKey = asPersonaKey(role);

  if (!personaKey || personaKey === "Tariq") {
    return NextResponse.json(
      { error: `No queue defined for role: ${role}` },
      { status: 400 }
    );
  }

  // Pull the wider source data once — each persona below filters /
  // shapes from the same pool so we don't issue multiple queries for
  // overlapping data (e.g. Rashid + Yusuf both look at jobs).
  //
  // Active-lead filter mirrors `/api/war-room/top-lead`: a row that
  // Salah already actioned (applied / dismissed / deferred) or whose
  // mission has been SHIPPED to LinkedIn is OUT of the active pool —
  // otherwise Yusuf's brief keeps showing "Apply to Speechify today"
  // hours after the mission shipped.
  const allJobs = (getSeenJobs(40) as SeenJobRow[]).filter((j) => {
    const ua = j.user_action || "";
    if (ua === "dismissed" || ua === "applied" || ua === "apply_later") {
      return false;
    }
    // mission_status is on the seen_jobs table but not in the local
    // SeenJobRow interface — read defensively.
    const ms =
      (j as unknown as { mission_status?: string | null }).mission_status || "";
    if (ms === "SHIPPED") return false;
    return true;
  });
  const recentDrafts = getRecentContent(20) as ContentRow[];
  const latestLead = getLatestManualLead();

  let items: QueueItem[] = [];

  if (personaKey === "Rashid") {
    // **Unprocessed leads** — Rashid's job is to surface fresh finds.
    // His queue shows pending-approval rows ONLY, so the moment Salah
    // approves a lead it drops off Rashid's desk and moves into
    // Kareem's queue. Legacy NULL approval_status is treated as
    // already-approved (pre-gate rows), so it doesn't pollute this
    // list either.
    const pending = allJobs.filter(
      (j) => j.approval_status === "pending_approval"
    );
    const byCompany = new Map<string, SeenJobRow>();
    for (const j of [...pending].sort(
      (a, b) => (b.fit_percentage ?? -1) - (a.fit_percentage ?? -1)
    )) {
      const k = (j.company || "unknown").toLowerCase();
      if (!byCompany.has(k)) byCompany.set(k, j);
    }
    items = Array.from(byCompany.values())
      .slice(0, 5)
      .map((j) => ({
        id: `job:${j.id}`,
        kind: "job",
        primary: j.company || "Unknown company",
        secondary: `${j.fit_percentage ?? "?"}% · ${tempBucket(j.fit_percentage)}`,
        leadId: j.id,
        status: "pending",
      }));
  } else if (personaKey === "Layla") {
    // **Content in progress** — split into Drafting (no user_action
    // yet, freshly generated) and Ready (approved or generated and
    // waiting for review). The workbench groups these under labels.
    items = recentDrafts.slice(0, 5).map((c) => {
      const preview =
        (c.generated_text || "").trim().slice(0, 50).replace(/\s+/g, " ") ||
        "(empty draft)";
      // "Ready" if the user already touched it (approved/published).
      // "Drafting" otherwise — Layla is still working on it OR it's
      // sitting waiting for Salah's first review.
      const isReady =
        c.user_action === "approved" ||
        c.user_action === "published" ||
        c.user_action === "scheduled";
      return {
        id: `draft:${c.id}`,
        kind: "draft",
        primary: preview,
        secondary: `${c.content_type || "draft"} · ${wordCount(c.generated_text)} words${
          c.user_action ? ` · ${c.user_action}` : ""
        }`,
        status: isReady ? "ready" : "drafting",
      };
    });
  } else if (personaKey === "Kareem") {
    // v3 — Kareem's panel now shows the **history of generated CVs**
    // instead of "pending audits". This matches Salah's mental model:
    // Kareem is the document custodian; his desk is the file cabinet
    // of every tailored CV the system has produced. Each row links
    // to the actual PDF via `/api/jobs/resume?file=…`.
    interface ResumeRow {
      id: number;
      job_id: string;
      job_title: string | null;
      company: string | null;
      fit_percentage: number | null;
      pdf_path: string;
      created_at: string;
    }
    let resumes: ResumeRow[] = [];
    try {
      const db = getDb();
      resumes = db
        .prepare(
          `SELECT id, job_id, job_title, company, fit_percentage, pdf_path, created_at
           FROM generated_resumes
           ORDER BY created_at DESC
           LIMIT 12`
        )
        .all() as ResumeRow[];
    } catch {
      resumes = [];
    }
    items = resumes.map((r) => {
      const filename = r.pdf_path.split("/").pop() || "";
      const fitFragment =
        r.fit_percentage != null ? `${r.fit_percentage}% fit` : "tailored";
      return {
        id: `cv:${r.id}`,
        kind: "audit",
        primary: `CV · ${r.company || "Unknown"}`,
        secondary: `${r.job_title || "untitled"} · ${fitFragment}`,
        leadId: r.job_id,
        status: "audited",
        // Reuse `imageUrl` slot for the download URL — the workbench's
        // Kareem branch reads this as a "Download CV" link.
        imageUrl: filename
          ? `/api/jobs/resume?file=${encodeURIComponent(filename)}`
          : undefined,
      };
    });
  } else if (personaKey === "Ghada") {
    // v3 — Ghada's panel is a **gallery of every generated visual**,
    // newest first. Posts without an image are still surfaced (so
    // Salah can spot what's missing) but the framing is "studio
    // archive" not "to-do queue".
    const gallery = (getRecentContent(40) as ContentRow[])
      .filter((c) => (c.content_type || "").includes("linkedin"))
      .slice(0, 12);
    items = gallery.map((c) => {
      const hasImage = !!c.image_url;
      const preview =
        (c.generated_text || "").trim().slice(0, 50).replace(/\s+/g, " ") ||
        "(empty draft)";
      return {
        id: `visual:${c.id}`,
        kind: "draft",
        primary: preview,
        secondary: hasImage
          ? `${c.content_type || "post"} · ✓ visual`
          : `${c.content_type || "post"} · no visual yet`,
        contentId: c.id,
        imageUrl: c.image_url || undefined,
        status: hasImage ? "ready" : "drafting",
      };
    });
  } else if (personaKey === "Yusuf") {
    // Yusuf's brief is a mixed pull — top high-fit job, the freshest
    // draft, and the active manual lead if one exists. He's the
    // supervisor: his queue should be a snapshot of "what's hot right
    // now", not one source.
    const topJob = [...allJobs].sort(
      (a, b) => (b.fit_percentage ?? -1) - (a.fit_percentage ?? -1)
    )[0];
    if (topJob) {
      const kit = resolveKit(topJob.id);
      items.push({
        id: `brief:job:${topJob.id}`,
        kind: "brief",
        primary: `Apply to ${topJob.company || "lead"} today`,
        secondary: `${topJob.fit_percentage ?? "?"}% fit · Rashid scouted`,
        leadId: topJob.id,
        resumePath: kit.resumePath || undefined,
        coverPath: kit.coverPath || undefined,
        resumeFilename: kit.resumeFilename,
      });
    }
    if (latestLead && latestLead.kit_status !== "error") {
      const kit = resolveKit(latestLead.id);
      items.push({
        id: `brief:lead:${latestLead.id}`,
        kind: "brief",
        primary: `Manual lead · ${latestLead.company || "untitled"}`,
        secondary: latestLead.contact_name
          ? `via ${latestLead.contact_name} · kit ${latestLead.kit_status || "in flight"}`
          : `kit ${latestLead.kit_status || "in flight"}`,
        leadId: latestLead.id,
        resumePath: kit.resumePath || undefined,
        coverPath: kit.coverPath || undefined,
        resumeFilename: kit.resumeFilename,
      });
    }
    if (recentDrafts[0]) {
      const d = recentDrafts[0];
      // Inline the full draft text + contentId so Yusuf's workbench
      // can preview and act ("Approve & Copy", "Request Edit") without
      // navigating to Layla's panel. `fullText` is the carousel
      // rewrite when Layla produced one — that's what publishes —
      // falling back to the original code-heavy draft otherwise.
      // Carousel PDF artefacts are inlined too so the review slab
      // can render the deck preview instead of the older single-PNG
      // infographic when both exist.
      const publishText = d.carousel_post_text || d.generated_text || "";
      items.push({
        id: `brief:draft:${d.id}`,
        kind: "brief",
        primary: `Layla's latest · ${d.content_type || "draft"}`,
        secondary: `${wordCount(publishText)} words · ${
          d.user_action || "awaiting review"
        }`,
        contentId: d.id,
        fullText: publishText,
        imageUrl: d.image_url || undefined,
        carouselPdfUrl: d.carousel_pdf_url || undefined,
        carouselSlides: parseSlideCount(d.carousel_deck_json),
        carouselBrandId: d.carousel_brand_id || undefined,
        status:
          d.user_action === "approved" ||
          d.user_action === "published" ||
          d.user_action === "scheduled"
            ? "ready"
            : "drafting",
      });
    }
    items = items.slice(0, 3);
  }

  return NextResponse.json({ role: personaKey, items });
}
