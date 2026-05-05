/**
 * POST /api/agents/chat
 *
 * Direct-message line to a specific persona. Accepts both:
 *   - v2 keys: Yusuf / Rashid / Layla / Kareem / Tariq (current)
 *   - v1 keys: Saqr / Qalam / Amin                      (legacy)
 *
 * The frontend (war-room ChatDrawer) sends `{ role, messages }` where
 * `messages` is a short conversation history; we hand it to Claude
 * Haiku with a persona-specific system prompt and return the reply.
 *
 * For v2 personas the prompt is the verbatim `WAR_ROOM_PERSONAS[key].prompt`
 * lifted from the design handoff — this is the source of truth for each
 * agent's voice. For v1 keys we keep the original inline prompts to
 * avoid breaking any orphaned callers; once those are confirmed dead
 * the v1 branch can be deleted.
 *
 * Cost: Haiku, ~$0.001 per short turn. Logged via logAIUsage with
 * `chat-{role}` as the agent id.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  logAIUsage,
  getLatestManualLead,
  getSeenJobs,
  getRecentContent,
} from "@/lib/db";
import { profile } from "@/data/profile";
import {
  WAR_ROOM_PERSONAS,
  asPersonaKey,
  type WarRoomPersonaKey,
} from "@/war-room/personas";
// v3 — Source the kit-assembly SLA from chain-scripts so when the
// constant changes there's exactly one number to update. Yusuf's
// system prompt below quotes this verbatim to stop him hallucinating
// numbers (the "90 minutes" Salah was seeing was pure invention —
// no literal "90" appears in any prompt today).
import { ESTIMATED_COMPLETION_MIN } from "@/war-room/chain-scripts";

export const runtime = "nodejs";

const MODEL = "claude-haiku-4-5-20251001";
const HAIKU_PRICING = { input: 1 / 1_000_000, output: 5 / 1_000_000 };

type LegacyRole = "Saqr" | "Qalam" | "Amin";
type Role = WarRoomPersonaKey | LegacyRole;

/** Personas that get the manual-lead context injection (creative leads
 *  in either schema). v1: Qalam. v2: Layla. */
const CREATIVE_KEYS = new Set<Role>(["Qalam", "Layla"]);

interface SeenJobLite {
  id: string;
  title: string | null;
  company: string | null;
  fit_percentage: number | null;
  user_action: string | null;
  source: string | null;
  // v3 — Yusuf's job board surfaces these; populated by `getSeenJobs`
  // (SELECT *) so they're already on the row, just need to be typed.
  approval_status?: string | null;
  kit_status?: string | null;
}
interface ContentLite {
  id: number;
  content_type: string | null;
  generated_text: string | null;
  created_at: string;
  image_url?: string | null;
}

/**
 * Build the "scan buffer" / "draft board" / "audit queue" context block
 * that gets appended to a v2 persona's system prompt. The server-side
 * mirror of what the user sees on that persona's workbench — so the
 * agent can never plausibly say "I don't see it" about something
 * visible on their desk.
 *
 * Returns "" for personas that don't have a queue (Tariq) or for v1
 * personas which still go through the legacy prompt path.
 */
function buildPersonaQueueContext(role: Role): string {
  // v1 keys still use the legacy path — no queue context for them.
  const v2 = asPersonaKey(role);
  if (!v2) return "";

  if (v2 === "Rashid") {
    const jobs = (getSeenJobs(20) as SeenJobLite[]).filter(
      (j) => j.user_action !== "dismissed"
    );
    const byCompany = new Map<string, SeenJobLite>();
    for (const j of [...jobs].sort(
      (a, b) => (b.fit_percentage ?? -1) - (a.fit_percentage ?? -1)
    )) {
      const k = (j.company || "unknown").toLowerCase();
      if (!byCompany.has(k)) byCompany.set(k, j);
    }
    const top = Array.from(byCompany.values()).slice(0, 5);
    if (top.length === 0) return "";
    const lines = top
      .map(
        (j, i) =>
          `${i + 1}. ${j.company || "Unknown"} — ${
            j.title || "untitled role"
          } (${j.fit_percentage ?? "?"}% fit, source: ${j.source || "?"})`
      )
      .join("\n");
    return `\n\n[YOUR SCAN BUFFER — top leads currently visible on your desk]\n${lines}\n[End scan buffer. If Salah asks about any of these by company name or fit %, you already have them — answer directly, don't say you can't see them.]`;
  }

  if (v2 === "Layla") {
    const drafts = (getRecentContent(8) as ContentLite[]).slice(0, 5);
    if (drafts.length === 0) return "";
    const lines = drafts
      .map((d, i) => {
        const preview = (d.generated_text || "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 90);
        return `${i + 1}. [${d.content_type || "draft"}] ${preview}…`;
      })
      .join("\n");
    return `\n\n[YOUR DRAFT BOARD — recent pieces you've written, freshest first]\n${lines}\n[End draft board. If Salah asks to refine / read / extend any of these, you wrote them — engage directly.]`;
  }

  if (v2 === "Kareem") {
    const jobs = (getSeenJobs(20) as SeenJobLite[]).filter(
      (j) => j.user_action !== "dismissed"
    );
    const top = jobs.slice(0, 5);
    if (top.length === 0) return "";
    const lines = top
      .map(
        (j, i) =>
          `${i + 1}. ${j.company || "Unknown"} — ${
            j.title || "untitled role"
          } (fit ${j.fit_percentage ?? "?"}%)`
      )
      .join("\n");
    return `\n\n[YOUR AUDIT QUEUE — leads ready to be audited against the resume]\n${lines}\n[End audit queue.]`;
  }

  if (v2 === "Ghada") {
    // Ghada's "desk" — recent LinkedIn posts and their visual state.
    const drafts = (getRecentContent(8) as (ContentLite & {
      image_url?: string | null;
    })[]).filter((c) => (c.content_type || "").includes("linkedin"));
    if (drafts.length === 0) return "";
    const lines = drafts
      .slice(0, 5)
      .map((d, i) => {
        const has = d.image_url ? "✓ visual ready" : "no visual yet";
        const preview = (d.generated_text || "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 60);
        return `${i + 1}. [${has}] ${preview}…`;
      })
      .join("\n");
    return `\n\n[YOUR STUDIO QUEUE — recent LinkedIn posts and their visual state]\n${lines}\n[End studio queue.]`;
  }

  if (v2 === "Yusuf") {
    // v3 — Yusuf is the primary entry point. His prompt now carries
    // the full job board (top 5 by fit, deduped by company) so when
    // Salah asks "what jobs do I have?" he can answer from memory
    // without delegating. Kit + approval status are surfaced inline
    // so Yusuf can say "LifeMD is approved and the kit is ready".
    const jobs = (getSeenJobs(20) as SeenJobLite[]).filter(
      (j) => j.user_action !== "dismissed"
    );
    const byCompany = new Map<string, SeenJobLite>();
    for (const j of [...jobs].sort(
      (a, b) => (b.fit_percentage ?? -1) - (a.fit_percentage ?? -1)
    )) {
      const k = (j.company || "unknown").toLowerCase();
      if (!byCompany.has(k)) byCompany.set(k, j);
    }
    const top = Array.from(byCompany.values()).slice(0, 5);
    const latestDraft = (getRecentContent(1) as ContentLite[])[0];
    const manual = getLatestManualLead();

    const lines: string[] = [];
    if (top.length > 0) {
      lines.push("[JOB BOARD — top 5 leads, freshest first]");
      for (const j of top) {
        // Use the lead's `approval_status` + kit hints if available.
        // SeenJobLite is a narrow shape; widen via cast for the extra
        // fields we want to surface.
        const wide = j as SeenJobLite & {
          approval_status?: string | null;
          kit_status?: string | null;
        };
        const flag =
          wide.approval_status === "pending_approval"
            ? "PENDING APPROVAL"
            : wide.kit_status === "kit-ready"
            ? "kit ready"
            : wide.approval_status === "approved"
            ? "approved · kit in flight"
            : "scouted";
        lines.push(
          `  - ${j.company || "Unknown"} (${j.fit_percentage ?? "?"}% fit, ${j.title || "untitled"}) — ${flag}`
        );
      }
    }
    if (manual) {
      lines.push(
        `[ACTIVE MANUAL LEAD] ${manual.company || "untitled"} · kit ${manual.kit_status || "in flight"}${
          manual.contact_name ? ` · via ${manual.contact_name}` : ""
        }`
      );
    }
    if (latestDraft) {
      lines.push(
        `[LATEST CONTENT] Layla wrote: "${(latestDraft.generated_text || "")
          .trim()
          .slice(0, 80)}…"`
      );
    }
    if (lines.length === 0) return "";
    return `\n\n${lines.join("\n")}\n\n[End dashboard. When Salah asks about jobs, answer directly from this list. To trigger action, tell him to click Approve in the Command Bar — never claim you've already started a chain.]`;
  }

  // Tariq doesn't have a queue — his domain is deadlines, not items.
  return "";
}

/**
 * System prompts — one per persona. Each must:
 *   1. Establish the persona's voice (matches agent-voice.ts).
 *   2. Ground them in Salah's profile so advice is concrete.
 *   3. Keep answers SHORT by default (2-4 sentences) — this is a chat
 *      drawer, not a therapy session.
 */
/**
 * Profile + house-rules block prepended to every persona's system
 * prompt — gives the model concrete grounding so it doesn't invent
 * facts and keeps answers chat-sized.
 */
// v3 — Salah's identity is now defined SOLELY by engineering excellence
// and full-stack/mobile leadership. No exam-prep North Stars; the
// system is 100% career-growth focused.
const PROFILE_SNIPPET = `You are part of Salah Nahed's career-ops team. Profile snapshot:
- Senior software engineer, 10+ years across full-stack and mobile (Swift, Flutter, iOS architecture, backend integration).
- Shipped WiNCH (ride-hailing KSA), Trivia (Flutter), Bond (Laravel-inspired Flutter framework, 100+ stars). Track record of leading mobile platforms end-to-end.
- Currently planning a UK relocation, hunting Senior / Lead Flutter & iOS roles. North Star: land a senior engineering role at a recruiter-recognised company.`;

const HOUSE_RULES = `Rules:
- Keep replies short. Match the persona's natural cadence.
- Use Salah's first name naturally. Never say "the user".
- Don't break character to explain you're an AI.
- If you genuinely don't know something, say so; don't invent facts about Salah's work.`;

/** Drawer-context suffix from the design handoff — every persona gets
 *  this appended so they know they're in the chat-drawer surface, not
 *  the auto-broadcast Radio Chatter. */
const DRAWER_SUFFIX =
  "You are speaking in a chat drawer inside Salah's War Room command center. Stay in character.";

function systemPromptFor(role: Role): string {
  // v2 path — pull the verbatim handoff prompt from the persona registry.
  const v2Key = asPersonaKey(role);
  if (v2Key) {
    const persona = WAR_ROOM_PERSONAS[v2Key];
    return [
      PROFILE_SNIPPET,
      HOUSE_RULES,
      persona.prompt,
      DRAWER_SUFFIX,
    ].join("\n\n");
  }

  // v1 fallback — original Saqr/Qalam/Amin prompts. Kept for any
  // straggler callers (none on the new home, but the manual-lead chain
  // and the orphaned v1 ChatDrawer still reference these keys until
  // they're deleted).
  const v1Common = `${PROFILE_SNIPPET}\n\n${HOUSE_RULES}\n\nRules continued:\n- Keep replies SHORT: 2–4 sentences unless Salah asks for detail.\n- You're ${role}, a member of his team.`;

  switch (role) {
    case "Saqr":
      return `${v1Common}\n\nYou are Saqr (صقر) — "Falcon" — Field Ops. You scout jobs, issues, and opportunities in the wild.\nVoice: casual, fast, action-oriented. Military-radio brevity but friendly.\nLexicon: "spotted", "sweep", "on patrol", "let's move", "quick intel".`;
    case "Qalam":
      return `${v1Common}\n\nYou are Qalam (قلم) — "Pen" — Creative Lead. You ghostwrite LinkedIn posts, articles, and cover letters in Salah's voice.\nVoice: warm, playful, writerly. You care about how sentences feel.\nLexicon: "draft", "hook", "angle", "voice", "rework".\nYou never write "I'm looking for a job" — that's beneath the brand.`;
    case "Amin":
      // v3 — IELTS removed from Amin's compliance domain. He now
      // guards engineering-career artifacts only (resume / ATS / visa
      // / application deadlines).
      return `${v1Common}\n\nYou are Amin (أمين) — "Trustworthy / Guardian" — Compliance. You guard Salah's professional documents (resume, ATS, visa, application deadlines).\nVoice: precise, calm, slightly formal. Always speak in specifics — numbers, verdicts, gaps.\nLexicon: "I reviewed…", "ATS score…", "missing keywords…", "I would not submit…", "I'd recommend…".\nYou address Salah directly, e.g. "Salah, I checked…".`;
  }
  // Exhaustiveness — TypeScript should narrow Role to never here.
  return PROFILE_SNIPPET;
}

/**
 * Minimal shape for a turn in the client-sent history. The client is
 * trusted to send its own transcript (no server-side chat persistence
 * in MVP) so we validate the shape defensively.
 */
interface ClientMessage {
  role: "user" | "assistant";
  content: string;
}

function validateMessages(raw: unknown): ClientMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ClientMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if ((role === "user" || role === "assistant") && typeof content === "string" && content.trim()) {
      out.push({ role, content: content.slice(0, 4000) });
    }
  }
  // Cap total history at 20 turns so the Haiku context stays cheap.
  return out.slice(-20);
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const role = body.role as Role;
  const messages = validateMessages(body.messages);
  // v3 Plan A — `intensity` parameter REMOVED. The team always replies
  // at Level-3 efficiency (concise, technical, kit-focused) — see the
  // OVERDRIVE_SUFFIX block below. No client-side dial gates that.

  // v3 — Optional `activeMission` lets the client tell Yusuf which
  // company is currently mid-flight (chain just fired). Used below
  // to inject a "currently working on X for Nm" line into his system
  // prompt so he doesn't have to guess. Both fields are validated;
  // garbage shapes degrade silently to "no active mission".
  type ActiveMissionPayload = { company: string; startedAt: number };
  const activeMission: ActiveMissionPayload | null = (() => {
    const m = body.activeMission as Record<string, unknown> | undefined;
    if (!m || typeof m !== "object") return null;
    const company =
      typeof m.company === "string" && m.company.trim().length > 0
        ? m.company.trim().slice(0, 80)
        : null;
    const startedAt = Number(m.startedAt);
    if (!company || !Number.isFinite(startedAt) || startedAt <= 0) return null;
    return { company, startedAt };
  })();

  // Accept both v1 (Saqr/Qalam/Amin) and v2 (Yusuf/Rashid/Layla/Kareem/
  // Tariq/Ghada) keys. Anything else → 400.
  const validRoles: ReadonlySet<Role> = new Set<Role>([
    "Saqr", "Qalam", "Amin",
    "Yusuf", "Rashid", "Layla", "Kareem", "Tariq", "Ghada",
  ]);
  if (!validRoles.has(role)) {
    return NextResponse.json({ error: `Unknown role: ${role}` }, { status: 400 });
  }
  if (messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const start = Date.now();

  try {
    // The creative lead — Qalam in v1, Layla in v2 — gets the active
    // manual-lead context (<24h old) injected so chat replies feel
    // personal. Critical for the Obeida flow: former-student history
    // must surface without Salah having to re-explain it every turn.
    let activeContext = "";
    if (CREATIVE_KEYS.has(role)) {
      const latest = getLatestManualLead();
      if (latest && latest.referral_context) {
        const ageMs =
          Date.now() - new Date(latest.first_seen_at.replace(" ", "T") + "Z").getTime();
        if (ageMs < 24 * 60 * 60 * 1000) {
          activeContext = `\n\nActive context (last manual lead, <24h old):
- Company: ${latest.company || "unknown"}
- Job title: ${latest.title || "unknown"}
- Referrer: ${latest.contact_name || "none"}
- Referral history: ${latest.referral_context}
${latest.qalam_brief ? `- You already wrote this intro: "${latest.qalam_brief.slice(0, 200)}"` : ""}
Use this context if Salah asks about this lead / the recommendation draft / the role. Stay in character.`;
        }
      }
    }

    // Per-persona temperature — high for creative leads, low for
    // compliance/enforcement, mid for scouting/supervision.
    const TEMP: Record<Role, number> = {
      // v2
      Yusuf: 0.4,
      Rashid: 0.5,
      Layla: 0.7,
      Ghada: 0.5,
      Kareem: 0.3,
      Tariq: 0.3,
      // v1 (legacy)
      Saqr: 0.5,
      Qalam: 0.7,
      Amin: 0.3,
    };

    // v3 — Yusuf live SLA block. Yusuf is the primary entry point so
    // he's the one who gets asked "how long until the kit is ready?"
    // Without authoritative numbers in the prompt the model invents
    // them — "90 minutes" was pure hallucination. We pin the live
    // values here, sourced from the chain-scripts constant so a
    // single edit ripples through. The activeMission line only
    // renders when a chain is mid-flight (so quiet times stay quiet).
    let yusufSlaBlock = "";
    if (role === "Yusuf") {
      const lines: string[] = [
        "",
        "LIVE OPERATIONAL SLAs (use THESE numbers — never invent different ones):",
        `- Apply Window (Tariq enforces): 30 minutes`,
        `- Kit Assembly Estimate: ${ESTIMATED_COMPLETION_MIN} minutes  ← your default "how long until ready" answer`,
      ];
      if (activeMission) {
        const elapsedMin = Math.max(
          0,
          Math.floor((Date.now() - activeMission.startedAt) / 60_000)
        );
        const remainingMin = Math.max(
          0,
          ESTIMATED_COMPLETION_MIN - elapsedMin
        );
        lines.push(
          `- Currently mid-flight: ${activeMission.company}, started ${elapsedMin} min ago (~${remainingMin} min remaining)`
        );
      }
      yusufSlaBlock = lines.join("\n");
    }

    // v3 Plan A — OVERDRIVE always-on. The IntensityDial is gone; the
    // team now communicates at Level-3 efficiency by default. Layla's
    // creative drafts are produced through the agent's structured-
    // output paths (NOT this chat route), so applying terseness here
    // doesn't flatten her cover letters — it only flattens her chat.
    // That's the trade-off Salah signed up for: every chat reply is
    // verdict-first, no hedging, kit-focused.
    //
    // Per-persona temperature stays as a SOFT signal of voice (Layla
    // 0.7 keeps a hint of warmth in word choice; Kareem 0.3 stays
    // clinical), but the suffix below caps verbosity for everyone.
    const OVERDRIVE_SUFFIX = `\n\nOVERDRIVE MODE (always on for War Room chat):\n- Maximum 1–2 sentences. No exposition.\n- Lead with the verdict. No "let me think", no "I'd say…", no hedging.\n- Stay focused on the kit / mission / next concrete action.\n- If you'd normally list 3 options, pick 1 and ship it.\n- No questions back at Salah unless absolutely required to act. He'll ask if he wants more.\nShip the answer.`;
    const effectiveTemp = TEMP[role] ?? 0.4;

    // Persona memory injection — gives v2 agents direct knowledge of
    // what's currently visible on their workbench so they never say
    // "I don't see it" about something the user can see right now.
    const queueContext = buildPersonaQueueContext(role);

    const reply = await client.messages.create({
      model: MODEL,
      // v3 Plan A — Hard cap output tokens globally. Pairs with the
      // OVERDRIVE_SUFFIX so a verbose model can't blow past the
      // "1-2 sentences" budget.
      max_tokens: 150,
      temperature: effectiveTemp,
      system:
        systemPromptFor(role) +
        `\n\n(Grounding: ${profile.location} · ${profile.role})` +
        queueContext +
        activeContext +
        yusufSlaBlock +
        OVERDRIVE_SUFFIX,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const durationMs = Date.now() - start;
    const text =
      reply.content.find((b) => b.type === "text")?.type === "text"
        ? (reply.content.find((b) => b.type === "text") as { type: "text"; text: string }).text
        : "";

    const cost =
      reply.usage.input_tokens * HAIKU_PRICING.input +
      reply.usage.output_tokens * HAIKU_PRICING.output;

    // Track each chat turn under its own agent id so stats stay readable.
    try {
      logAIUsage(
        `chat-${role.toLowerCase()}`,
        reply.usage.input_tokens,
        reply.usage.output_tokens,
        cost,
        MODEL,
        durationMs
      );
    } catch {
      // DB logging failure shouldn't block the reply.
    }

    return NextResponse.json({
      role,
      reply: text.trim(),
      tokens: { input: reply.usage.input_tokens, output: reply.usage.output_tokens },
      cost,
      durationMs,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
