/**
 * Ghada AI Agent — Visual Lead.
 *
 * Turns Layla's technical LinkedIn posts into minimalist diagram-style
 * SVG images via Claude. SVG (not raster) is the right tool for this
 * spec because:
 *
 *   - Text labels render perfectly (DALL-E garbles them)
 *   - The "blueprint diagram" aesthetic is literally what SVG is for
 *   - Cost is ~$0.005 per diagram via Sonnet (vs $0.04 for DALL-E)
 *   - Output is editable + scales infinitely
 *   - Reuses the existing Anthropic key — no new API to provision
 *
 * The aesthetic is enforced strictly inside `SVG_SYSTEM_PROMPT` so
 * every visual lands the same look:
 *
 *   - Solid dark background (#0a0a14) — full SVG canvas
 *   - Glowing electric-violet (#9d4edd) strokes, nodes, accents
 *   - Clean white sans-serif labels (Inter/system fonts)
 *   - Geometric shapes — flowcharts, nodes, pipes, gauges
 *   - Subtle grid texture for the "schematic" feel
 *
 * Two trigger paths:
 *   1. Auto — Layla publishes `content:linkedin-post-created` after
 *      writing a new gem_linkedin_post. Ghada subscribes here and
 *      generates a diagram immediately.
 *   2. Manual — `POST /api/war-room/visual { contentId }` triggers a
 *      fresh generation (or regeneration if the row already has one).
 *
 * Storage flow: Claude returns SVG markup as a string. We write the
 * raw SVG to `public/wr-visuals/{contentId}.svg` and store the public
 * path (`/wr-visuals/{contentId}.svg`) on `generated_content.image_url`.
 * Browsers render SVG natively in `<img>` tags so no extra UI work.
 *
 * LinkedIn caveat: Zernio expects raster images, so the publish path
 * skips the image attachment when image_url ends in .svg (handled in
 * zernio-service.ts). For now Ghada visuals are display-only inside
 * the War Room. To attach to LinkedIn we'd need an SVG→PNG converter
 * (`sharp` or `resvg`) — flagged as a follow-up if the test goes well.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod/v4";
import Anthropic from "@anthropic-ai/sdk";
import { AIAgent, type AIAgentConfig } from "../base/ai-agent";
import type { AgentBus } from "../base/agent-bus";
import {
  setContentImage,
  getContentById,
  logAIUsage,
} from "@/lib/db";
import {
  generateImage as generateOpenAIImage,
  buildSpiderVersePrompt,
} from "@/services/openai-image-service";
import type { AgentResult } from "@/types";

/** Result returned by the agent's public methods so callers (the API
 *  route + the auto-trigger subscriber) can react uniformly. */
export interface GhadaResult {
  ok: boolean;
  contentId: number;
  imageUrl?: string;
  /** The exact prompt sent to Claude (post Haiku summarisation +
   *  aesthetic wrap). Stored alongside the image for transparency. */
  imagePrompt?: string;
  error?: string;
  /** Cost in USD — sum of Haiku summariser + Sonnet SVG call. */
  costUsd?: number;
}

/** Pricing per million tokens for the models we use. */
const HAIKU_PRICING = { input: 1 / 1_000_000, output: 5 / 1_000_000 };
const SONNET_PRICING = { input: 3 / 1_000_000, output: 15 / 1_000_000 };

/** Model ids — using Sonnet for SVG (better at structured output) and
 *  Haiku for the cheap summariser pass. */
const SVG_MODEL = "claude-sonnet-4-20250514";
const SUMMARISER_MODEL = "claude-haiku-4-5-20251001";

/** SVG canvas — landscape, 16:9-ish, sized for LinkedIn aspect ratios
 *  even though we're not actually shipping the SVG to LinkedIn yet. */
const SVG_WIDTH = 1024;
const SVG_HEIGHT = 576;

/** System prompt for the SVG generator. Encoded as a constant so every
 *  Ghada visual lands the SAME blueprint look — only the diagram
 *  content varies based on the per-post visual brief. */
const SVG_SYSTEM_PROMPT = `You are Ghada, the visual lead. You produce minimalist technical-diagram SVGs for Salah's LinkedIn posts. Aesthetic: professional tech-blog dark mode with cyan + amber accents — readable like a Stripe or Vercel docs diagram, not flashy.

OUTPUT CONTRACT
- Return ONLY raw SVG markup. No markdown fences, no commentary, nothing else.
- The opening tag must be exactly: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" width="${SVG_WIDTH}" height="${SVG_HEIGHT}">
- The closing tag must be </svg>.

AESTHETIC (mandatory, every diagram)
- Solid deep-slate background: <rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="#0f172a"/> as the FIRST child.
- Subtle grid texture overlay (1px lines at #1e293b, 40px spacing) for the schematic feel.
- PRIMARY accent — cyan (#22d3ee) for most strokes, arrows, and node borders. This is the "default ink" of the diagram.
- SECONDARY accent — amber (#fbbf24) used SPARINGLY (1-3 elements per diagram) to highlight the focal node, the critical path, or the "magic" component the post is about. Amber draws the eye; don't dilute it.
- Optional soft glow on the focal accent only: <filter><feGaussianBlur stdDeviation="1.5"/></filter>. Other strokes stay sharp.
- Node fills: dark slate (#1e293b) with the accent stroke on top. Avoid saturated fills.
- Labels in slate-100 (#f1f5f9), font-family="ui-sans-serif, system-ui, -apple-system, sans-serif", weight 500, size 14-18px.
- Section titles (if any): same font, weight 700, size 20-24px, dimmer cyan (#67e8f9).
- NO emojis. NO photorealism. NO 3D. NO clip-art icons. NO human figures. NO gradients other than the optional focal glow.

CONTENT
- Visualise the technical concept from the visual brief literally — flowchart, sequence, layered architecture, state machine, data pipeline, whatever fits.
- 3-7 nodes is the sweet spot. Resist cramming.
- Use real labels — readable text inside boxes, on edges, as captions. Class names, method names, and platform names (Firebase / Mixpanel / Amplitude / etc.) are encouraged because they're the post's keywords.
- Centred composition. Generous negative space. The diagram should feel scannable in 2 seconds.

EXAMPLES OF GOOD STRUCTURES
- Boxed nodes connected by arrows ("Input → Cache → API → DB"). Use cyan for the pipe, amber for the box that's the "magic" of the post.
- Concentric layers ("Bond Framework → Service Container → Storage Driver → SharedPrefs"). Cyan for the layer borders, amber for the focal layer.
- Branching decision tree ("Request → Online? → Yes (live) | No (cached)"). Cyan for branches, amber for the decision diamond.
- Hub-and-spoke ("AnalyticsProvider → [Firebase] [Mixpanel] [Amplitude]"). Amber for the hub, cyan for each spoke.
- Timeline / lane diagram with horizontal swimlanes — cyan lanes, amber for the critical event.
`;

/** Prompt template that gets sent as the user message for the SVG call.
 *  Slices the brief at our hard cap so an over-eager Haiku response
 *  doesn't bloat Sonnet's input window. */
function buildImagePrompt(visualBrief: string): string {
  const trimmed = visualBrief.slice(0, VISUAL_BRIEF_MAX_CHARS).trim();
  return `Visual brief for the diagram you're about to draw:\n\n${trimmed}\n\nRender the SVG now.`;
}

/** Schema for the Haiku summariser — forces the model to produce a
 *  single one-sentence visual brief rather than a paragraph. We bound
 *  the LOWER end strictly (need real content) but leave the upper end
 *  generous because Haiku can't reliably hit a tight upper limit and
 *  the SVG generator handles long inputs fine. We slice client-side
 *  in `buildImagePrompt` if needed. */
const VisualBriefSchema = z.object({
  brief: z
    .string()
    .min(10)
    .max(800)
    .describe(
      "One-sentence description of what the diagram should depict — concrete shapes, flow, and labels. No marketing language."
    ),
});

/** Hard cap on what we send to the SVG generator regardless of what
 *  Haiku produced — keeps the Sonnet input bounded. */
const VISUAL_BRIEF_MAX_CHARS = 500;

/** Resolve the project root by walking up from this file — needed for
 *  the `/public/wr-visuals` write path because turbopack's process.cwd
 *  is sandboxed to "/ROOT". Same trick the pdf-service uses. */
function findProjectRoot(): string {
  try {
    const here = fileURLToPath(import.meta.url);
    let dir = path.dirname(here);
    for (let i = 0; i < 8; i++) {
      if (
        fs.existsSync(path.join(dir, "package.json")) &&
        fs.existsSync(path.join(dir, "public"))
      ) {
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // ESM resolution failed — fall through to cwd.
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const VISUAL_DIR = path.join(PROJECT_ROOT, "public", "wr-visuals");

function ensureVisualDir() {
  if (!fs.existsSync(VISUAL_DIR)) {
    fs.mkdirSync(VISUAL_DIR, { recursive: true });
  }
}

/** Strip code fences / prose wrapping if Claude added any despite the
 *  "raw SVG only" instruction. Claude is mostly compliant but the
 *  occasional ```svg``` slips through; this is the safety net. */
function extractSvg(raw: string): string | null {
  const trimmed = raw.trim();
  // Try a code-fence first (```svg ... ``` or ``` ... ```).
  const fenceMatch = trimmed.match(/```(?:svg|xml)?\s*\n?([\s\S]*?)\n?```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  // Find the <svg ...> ... </svg> block specifically.
  const svgMatch = candidate.match(/<svg\b[\s\S]*?<\/svg>/i);
  return svgMatch ? svgMatch[0] : null;
}

export class GhadaAIAgent extends AIAgent {
  constructor(bus: AgentBus) {
    const config: AIAgentConfig = {
      id: "ghada",
      name: "Ghada (Visual)",
      systemPrompt:
        "You are Ghada, the visual lead. You produce minimalist technical-diagram visuals for Salah's LinkedIn posts. Aesthetic: blueprint, dark background, electric violet glow, clean sans-serif labels.",
      temperature: 0.4,
      maxTokens: 200,
    };
    super(config, bus);

    // Auto-trigger — when Layla publishes a new linkedin post we go
    // make the visual for it. subscribeOnce so HMR reloads don't stack.
    //
    // Routes to Spider-Verse (DALL-E 3 PNG) instead of the legacy SVG
    // path: Zernio / LinkedIn drop SVG attachments on publish, leaving
    // posts text-only. Spider-Verse PNG is reliably attachable.
    //
    // Note: gem-mining (`runCodeGemMining`) no longer fires this event
    // — it renders the BondInfographic PNG inline. So this auto-trigger
    // now only fires for non-gem flows (e.g. shipped-PR posts).
    this.bus.subscribeOnce(
      "ghada:content:linkedin-post-created",
      "content:linkedin-post-created",
      async (event) => {
        const data = event.payload as {
          contentId: number;
          text: string;
        };
        if (!data?.contentId || !data?.text) return;
        console.log(
          `[Ghada] new linkedin post ${data.contentId} — generating Spider-Verse PNG…`
        );
        try {
          await this.generateSpiderVerseForContent(data.contentId, data.text);
        } catch (err) {
          console.error("[Ghada] visual generation failed:", err);
        }
      }
    );
  }

  async run(): Promise<AgentResult> {
    // Event-driven primarily — Run All is a status no-op. The
    // `agentId` cast matches the same back-compat pattern Bureaucrat
    // uses for personas added after the original AgentId union.
    return {
      findings: [
        {
          id: "ghada-ready",
          agentId: "ghada" as never,
          severity: "info",
          title: "Ghada (Visual) is on standby",
          description:
            "Listens for new LinkedIn posts and generates blueprint-style diagrams via DALL-E 3.",
          category: "status",
        },
      ],
      actionItems: [],
    };
  }

  /**
   * Public entry point — generate (or regenerate) a visual for a
   * specific content row. Handles the full pipeline:
   *   1. Haiku summariser → one-sentence visual brief
   *   2. Sonnet → SVG markup conforming to the blueprint aesthetic
   *   3. Sanitise + write the SVG to /public/wr-visuals/{id}.svg
   *   4. Persist image_url + image_prompt on the content row
   *   5. Log activity for the chatter feed
   */
  async generateForContent(
    contentId: number,
    text?: string,
    /** When provided, bypasses the Haiku summariser and uses this
     *  string as the visual brief verbatim. Powers Ghada's chat-driven
     *  edit flow — Salah types what he wants changed, Sonnet draws it. */
    briefOverride?: string
  ): Promise<GhadaResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      const err =
        "ANTHROPIC_API_KEY is not set — visual generation disabled";
      this.logStep("ghada:no-api-key", err, { contentId });
      return { ok: false, contentId, error: err };
    }

    // Source text — either passed in by the caller or fetched from
    // the content row directly.
    const postText = (() => {
      if (text && text.trim()) return text.trim();
      const row = getContentById(contentId);
      return row?.generated_text || "";
    })();

    if (!postText || postText.length < 30) {
      const err = `Content ${contentId} has no usable text for SVG generation`;
      this.logStep("ghada:empty-source", err, { contentId });
      return { ok: false, contentId, error: err };
    }

    let totalCostUsd = 0;

    // 1. Visual brief — either Salah's explicit edit instruction
    //    (briefOverride) or the cheap Haiku pass that extracts a
    //    single-line "what should the diagram show" sentence.
    let briefResult:
      | { ok: true; brief: string; costUsd: number }
      | { ok: false; error: string; costUsd: number };
    if (briefOverride) {
      // Skip the summariser — caller's brief is already focused.
      briefResult = { ok: true, brief: briefOverride, costUsd: 0 };
    } else {
      briefResult = await this.summariseToBrief(postText);
    }
    if (!briefResult.ok) {
      return {
        ok: false,
        contentId,
        error: `brief summariser failed: ${briefResult.error}`,
      };
    }
    totalCostUsd += briefResult.costUsd;

    const userPrompt = buildImagePrompt(briefResult.brief);

    // v3 — chat-style log entry. The Chat Drawer interleaves activity
    // log entries with localStorage messages, so this line shows up in
    // Ghada's chat as a system bubble: "Generating technical
    // blueprint for [Company]... using prompt: [Prompt Text]". Helps
    // Salah see what Ghada is actually doing without leaving her
    // panel. We pull the company name from the post text best-effort.
    const companyHint = (() => {
      // Heuristic: look for "for {Company}" or "at {Company}" near
      // the start of the post. Falls back to "Salah's post".
      const m = postText
        .slice(0, 400)
        .match(/(?:^|\s)(?:for|at)\s+([A-Z][\w&. -]{1,40})/);
      return m?.[1]?.trim() || "Salah's post";
    })();
    this.logStep(
      "ghada:chat-log",
      `Generating technical blueprint for ${companyHint}... using prompt: ${briefResult.brief.slice(0, 200)}`,
      { contentId, company: companyHint, brief: briefResult.brief }
    );

    // 2. Sonnet SVG call. We don't use the AIAgent.analyze() helper
    //    because that path forces JSON parsing — we want raw markup.
    const client = new Anthropic({ apiKey });
    const start = Date.now();
    let svgRaw = "";
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      const reply = await client.messages.create({
        model: SVG_MODEL,
        // SVG markup runs long when there are 5+ nodes with arrows
        // and labels — give it room. Stays well under Sonnet's max.
        max_tokens: 4000,
        // Low temperature — diagrams should be deterministic-ish, not
        // creative. This is engineering output, not poetry.
        temperature: 0.3,
        system: SVG_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });
      const block = reply.content.find((b) => b.type === "text");
      svgRaw = block && block.type === "text" ? block.text : "";
      inputTokens = reply.usage.input_tokens;
      outputTokens = reply.usage.output_tokens;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logStep(
        "ghada:claude-error",
        `Sonnet SVG call failed: ${msg.slice(0, 120)}`,
        { contentId }
      );
      return { ok: false, contentId, error: msg, costUsd: totalCostUsd };
    }

    const sonnetCost =
      inputTokens * SONNET_PRICING.input +
      outputTokens * SONNET_PRICING.output;
    totalCostUsd += sonnetCost;
    try {
      logAIUsage(
        "ghada",
        inputTokens,
        outputTokens,
        sonnetCost,
        SVG_MODEL,
        Date.now() - start
      );
    } catch {
      // Don't block on usage logging.
    }

    // 3. Sanitise + write. extractSvg pulls the <svg>…</svg> block out
    //    even if Claude wrapped it in a fence. If we still can't find
    //    one, error out — we won't write garbage to disk.
    const svg = extractSvg(svgRaw);
    if (!svg) {
      const err = `Sonnet returned no <svg> markup. First 200 chars: ${svgRaw.slice(0, 200)}`;
      this.logStep("ghada:no-svg", err, { contentId });
      return { ok: false, contentId, error: err, costUsd: totalCostUsd };
    }

    const localPath = path.join(VISUAL_DIR, `${contentId}.svg`);
    const publicUrl = `/wr-visuals/${contentId}.svg`;
    try {
      ensureVisualDir();
      fs.writeFileSync(localPath, svg, "utf8");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logStep(
        "ghada:write-error",
        `SVG write failed: ${msg.slice(0, 120)}`,
        { contentId }
      );
      return { ok: false, contentId, error: msg, costUsd: totalCostUsd };
    }

    // 4. Persist on the content row. We store the brief as the prompt
    //    record (not the full SVG_SYSTEM_PROMPT — that's invariant).
    setContentImage(contentId, publicUrl, briefResult.brief);

    // 5. Chatter-feed entry.
    this.logStep(
      "ghada:visual-ready",
      `SVG ready for content ${contentId} · ${briefResult.brief.slice(0, 80)}`,
      { contentId, imageUrl: publicUrl, costUsd: totalCostUsd },
      { costUsd: totalCostUsd }
    );

    return {
      ok: true,
      contentId,
      imageUrl: publicUrl,
      imagePrompt: briefResult.brief,
      costUsd: totalCostUsd,
    };
  }

  /**
   * Spider-Verse raster path. Same pipeline as `generateForContent`
   * (Haiku brief → image gen → persist + log) but routes through the
   * OpenAI DALL-E 3 service instead of Sonnet's SVG. Output is a PNG
   * at `/public/wr-visuals/{contentId}.png`.
   *
   * Trade-offs vs. the SVG path: ~8x the per-image cost ($0.04 vs
   * ~$0.005), and DALL-E garbles text labels — that's why the prompt
   * template explicitly says "no text". For LinkedIn feed scroll-stop
   * appeal, the comic-book aesthetic wins; for diagrams that need to
   * communicate exact API shapes or labels, stay on the SVG path.
   */
  async generateSpiderVerseForContent(
    contentId: number,
    text?: string,
    /** Salah's explicit edit instruction. Skips both the post-text
     *  fetch and the metaphor summariser — caller-provided brief
     *  goes straight into the DALL-E prompt template. */
    briefOverride?: string
  ): Promise<GhadaResult> {
    // Source text — passed in by the caller or fetched from the row.
    const postText = (() => {
      if (text && text.trim()) return text.trim();
      const row = getContentById(contentId);
      return row?.generated_text || "";
    })();
    if (!postText || postText.length < 30) {
      const err = `Content ${contentId} has no usable text for Spider-Verse generation`;
      this.logStep("ghada:empty-source", err, { contentId });
      return { ok: false, contentId, error: err };
    }

    let totalCostUsd = 0;

    // 1. Visual METAPHOR brief — either Salah's explicit edit
    //    instruction (briefOverride) or the Haiku metaphor pass.
    let metaphorResult:
      | { ok: true; brief: string; costUsd: number }
      | { ok: false; error: string; costUsd: number };
    if (briefOverride) {
      metaphorResult = { ok: true, brief: briefOverride, costUsd: 0 };
    } else {
      metaphorResult = await this.summariseToVisualMetaphor(postText);
    }
    if (!metaphorResult.ok) {
      return {
        ok: false,
        contentId,
        error: `visual-metaphor summariser failed: ${metaphorResult.error}`,
      };
    }
    totalCostUsd += metaphorResult.costUsd;

    const prompt = buildSpiderVersePrompt(metaphorResult.brief);

    this.logStep(
      "ghada:chat-log",
      `Generating Spider-Verse panel via DALL-E 3 · metaphor: ${metaphorResult.brief.slice(0, 160)}`,
      { contentId, brief: metaphorResult.brief, style: "spider-verse" }
    );

    // 2. DALL-E 3 call via the openai-image-service. b64-then-write
    //    so the image survives OpenAI's 1-hour URL expiry.
    const imageResult = await generateOpenAIImage(contentId, { prompt });
    if (!imageResult.ok) {
      this.logStep(
        "ghada:openai-error",
        `DALL-E 3 call failed: ${imageResult.error.slice(0, 160)}`,
        { contentId, error: imageResult.error }
      );
      return {
        ok: false,
        contentId,
        error: imageResult.error,
        costUsd: totalCostUsd,
      };
    }
    totalCostUsd += imageResult.costUsd;

    // Cost tracking — billed under `ghada-image` so DALL-E spend is
    // separable from Ghada's Sonnet/Haiku spend in the analytics view.
    try {
      logAIUsage(
        "ghada-image",
        0,
        0,
        imageResult.costUsd,
        "dall-e-3-1024x1024-standard",
        imageResult.durationMs
      );
    } catch {
      // Don't block on usage logging.
    }

    // 3. Persist on the content row. Metaphor is the prompt record
    //    (we don't store the full template — that's invariant).
    setContentImage(contentId, imageResult.imageUrl, metaphorResult.brief);

    // 4. Chatter-feed entry.
    this.logStep(
      "ghada:visual-ready",
      `Spider-Verse PNG ready for content ${contentId} · ${metaphorResult.brief.slice(0, 80)}`,
      {
        contentId,
        imageUrl: imageResult.imageUrl,
        costUsd: totalCostUsd,
        style: "spider-verse",
      },
      { costUsd: totalCostUsd }
    );

    return {
      ok: true,
      contentId,
      imageUrl: imageResult.imageUrl,
      imagePrompt: metaphorResult.brief,
      costUsd: totalCostUsd,
    };
  }

  /**
   * Visual-metaphor summariser. Reads a LinkedIn post and produces a
   * one-sentence ABSTRACT-MECHANICAL brief — gears, pipelines, neon
   * architecture — with zero people, zero text references, zero
   * profile language. This is what gets fed to DALL-E so the resulting
   * image isn't a person holding a garbled sign.
   *
   * Separate from `summariseToBrief` (which produces a literal technical
   * brief for the blueprint SVG path) because the SVG can render labels
   * legibly and benefits from concrete component names.
   */
  private async summariseToVisualMetaphor(postText: string): Promise<
    | { ok: true; brief: string; costUsd: number }
    | { ok: false; error: string; costUsd: number }
  > {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        error: "ANTHROPIC_API_KEY missing — can't run visual metaphor",
        costUsd: 0,
      };
    }
    const client = new Anthropic({ apiKey });
    const start = Date.now();
    try {
      const reply = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        temperature: 0.6,
        system:
          "You translate technical LinkedIn posts into one-sentence VISUAL METAPHORS for an abstract comic-book illustration. Output JSON: { \"brief\": \"...\" }. The brief MUST describe a concrete physical scene composed of mechanical or architectural elements — gears, pipes, glowing data streams, neon city architecture, circuit-board landscapes, abstract geometric flows. The brief MUST NOT mention people, faces, profiles, jobs, roles, years of experience, technologies by name, or text. 15-35 words. Examples of good output: 'Two parallel cyan data pipelines converging at a hexagonal magenta junction, surrounded by spinning gears against a neon city skyline.' / 'A glowing circuit-board landscape with three rising towers connected by arcs of pink electricity, fed by interlocking pipes from below.'",
        messages: [
          {
            role: "user",
            content: `Translate this post into a one-sentence visual metaphor. Remember: no people, no text, no technology names, no job titles. Just abstract mechanical/architectural imagery.\n\nPOST:\n"""\n${postText.slice(
              0,
              2500
            )}\n"""`,
          },
        ],
      });
      const block = reply.content.find((b) => b.type === "text");
      const raw = block && block.type === "text" ? block.text.trim() : "";
      const cleaned = raw
        .replace(/^```(?:json)?\n?/, "")
        .replace(/\n?```$/, "");
      let parsed: { brief?: unknown };
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        return {
          ok: false,
          error: `metaphor summariser returned invalid JSON: ${cleaned.slice(0, 120)}`,
          costUsd: 0,
        };
      }
      if (typeof parsed.brief !== "string" || parsed.brief.length < 10) {
        return {
          ok: false,
          error: "metaphor summariser missing 'brief' field",
          costUsd: 0,
        };
      }
      const cost =
        reply.usage.input_tokens * HAIKU_PRICING.input +
        reply.usage.output_tokens * HAIKU_PRICING.output;
      try {
        logAIUsage(
          "ghada-summariser",
          reply.usage.input_tokens,
          reply.usage.output_tokens,
          cost,
          "claude-haiku-4-5-20251001",
          Date.now() - start
        );
      } catch {
        // Don't block on stats logging.
      }
      return { ok: true, brief: parsed.brief, costUsd: cost };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg, costUsd: 0 };
    }
  }

  /**
   * Run a Haiku pass that produces a single-sentence visual brief.
   * We don't use the base AIAgent.analyze() helper because that wires
   * in usage tracking in a way that conflates Ghada with the existing
   * agents — we want her billed separately under `ghada-summariser`.
   */
  private async summariseToBrief(postText: string): Promise<
    | { ok: true; brief: string; costUsd: number }
    | { ok: false; error: string; costUsd: number }
  > {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        error: "ANTHROPIC_API_KEY missing — can't run visual brief",
        costUsd: 0,
      };
    }
    const client = new Anthropic({ apiKey });
    const start = Date.now();
    try {
      const reply = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        temperature: 0.3,
        system:
          "You are extracting a one-sentence visual brief for a technical diagram. Focus on the concrete technical concept — name the system components, the flow, and the labels. No marketing words. Output JSON: { \"brief\": \"...\" }. Brief should be 15-40 words, no longer.",
        messages: [
          {
            role: "user",
            content: `Read this LinkedIn post and produce a JSON visual brief for a minimalist blueprint-style diagram. Focus on the "Payoff" and "Downside" sections if they exist — those carry the technical content. Otherwise summarise the whole thing.\n\nPOST:\n"""\n${postText.slice(
              0,
              3000
            )}\n"""`,
          },
        ],
      });
      const block = reply.content.find((b) => b.type === "text");
      const raw =
        block && block.type === "text" ? block.text.trim() : "";
      const cleaned = raw
        .replace(/^```(?:json)?\n?/, "")
        .replace(/\n?```$/, "");
      let parsed: unknown;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        return {
          ok: false,
          error: `summariser returned invalid JSON: ${cleaned.slice(0, 120)}`,
          costUsd: 0,
        };
      }
      const validation = VisualBriefSchema.safeParse(parsed);
      if (!validation.success) {
        return {
          ok: false,
          error: `summariser schema mismatch: ${validation.error.message.slice(0, 120)}`,
          costUsd: 0,
        };
      }
      const cost =
        reply.usage.input_tokens * HAIKU_PRICING.input +
        reply.usage.output_tokens * HAIKU_PRICING.output;
      try {
        logAIUsage(
          "ghada-summariser",
          reply.usage.input_tokens,
          reply.usage.output_tokens,
          cost,
          "claude-haiku-4-5-20251001",
          Date.now() - start
        );
      } catch {
        // Don't block on stats logging.
      }
      return { ok: true, brief: validation.data.brief, costUsd: cost };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg, costUsd: 0 };
    }
  }
}
