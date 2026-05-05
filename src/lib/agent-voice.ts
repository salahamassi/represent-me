/**
 * agent-voice — translate raw agent bus events into first-person lines
 * so the War Room chatter reads like a team at work instead of a log tail.
 *
 * Personality contract (kept DELIBERATELY narrow per Salah's spec):
 *   Saqr  (صقر) — Field Ops. Casual, fast, reports from the wild.
 *   Qalam (قلم) — Creative Lead. Warm, playful, talks like a writer.
 *   Amin  (أمين) — Compliance. Precise. Never hand-wavy. Speaks in numbers.
 *   Sifr  (صفر) — Lead. Supportive, strategic, one sentence only.
 *   System  — Plumbing. Short and neutral.
 *
 * We parse the event payload out of `detail` (truncated at 500 chars by
 * logActivity) using targeted regexes — the same trick Jarvis Brief uses.
 * That means we never rely on the JSON being complete; we only need the
 * first few fields (fit / company / score / missing) which always sit
 * near the top of every payload the current agents emit.
 */

import type { AgentBusFrame } from "@/hooks/useAgentOrchestrator";
import type { AgentRole } from "@/agents/base/agent-aliases";

export interface HumanSpoken {
  speaker: AgentRole;
  /** First-person sentence the bubble shows. */
  text: string;
  /** A short tone hint used purely for styling (not rendered as text). */
  tone: "neutral" | "positive" | "warning" | "negative" | "thinking";
}

function pluck(detail: string | null, pattern: RegExp): string | null {
  if (!detail) return null;
  const m = detail.match(pattern);
  return m?.[1] ?? null;
}

function pluckArray(detail: string | null, key: string): string[] {
  if (!detail) return [];
  const outer = detail.match(new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]*)\\]`));
  if (!outer) return [];
  return Array.from(outer[1].matchAll(/"([^"]+)"/g)).map((m) => m[1]);
}

/**
 * Translate a bus frame into a first-person line. The caller decides
 * whether to render a "Qalam is typing…" indicator beforehand — this
 * helper is pure, no timing, no DOM.
 */
export function toHumanSpeak(event: AgentBusFrame): HumanSpoken {
  const role = event.role;
  const detail = event.detail;
  const type = event.eventType.toLowerCase();
  const title = event.title;

  // ---- Phase 6: manual-lead chain events ------------------------------
  // These fire on bus_event rows + activity rows the agents log directly.
  // We gate on the specific event_type so they short-circuit before the
  // generic per-persona branches below.
  if (type === "bus_event" && title.includes("manual-lead:submitted")) {
    const company = pluck(detail, /"company"\s*:\s*"([^"]+)"/);
    return {
      speaker: "System",
      tone: "neutral",
      text: `Manual lead received${company ? ` for ${company}` : ""}. Saqr is picking it up.`,
    };
  }
  if (type === "manual-lead:analyzed" || (type === "bus_event" && title.includes("manual-lead:analyzed"))) {
    const fit = pluck(detail, /"fitPercentage"\s*:\s*(\d+)/);
    const company = pluck(detail, /"company"\s*:\s*"([^"]+)"/);
    return {
      speaker: "Saqr",
      tone: "positive",
      text: `Locked three factors on ${company || "this role"} — ${fit || "?"}% fit. Passing to the team.`,
    };
  }
  if (type === "qalam:manual-lead-brief") {
    // The activity row's title IS Qalam's brief (first 180 chars). Just
    // surface it verbatim so the feed reads exactly as Qalam wrote.
    return { speaker: "Qalam", tone: "positive", text: title };
  }
  if (type === "bus_event" && title.includes("manual-lead:qalam-brief-ready")) {
    const company = pluck(detail, /"company"\s*:\s*"([^"]+)"/);
    return {
      speaker: "Qalam",
      tone: "thinking",
      text: `Draft + rec request ready${company ? ` for ${company}` : ""}.`,
    };
  }
  if (type === "amin:manual-lead-kit") {
    return { speaker: "Amin", tone: "positive", text: title };
  }
  if (type === "bus_event" && title.includes("manual-lead:kit-ready")) {
    const company = pluck(detail, /"company"\s*:\s*"([^"]+)"/);
    return {
      speaker: "Amin",
      tone: "positive",
      text: `Kit prepared for ${company || "this lead"} — resume + cover letter are in the hero dock.`,
    };
  }
  if (type.includes("manual-lead:error") || type.includes("manual-lead-error")) {
    return {
      speaker: role,
      tone: "negative",
      text: `Manual-lead chain hit a snag: ${title.slice(0, 140)}`,
    };
  }

  // ---- Saqr: Field Ops ----------------------------------------------
  if (role === "Saqr") {
    // Published a `job:high-fit` event → report the hit.
    if (type === "bus_event" && title.includes("job:high-fit")) {
      const fit = pluck(detail, /"fitPercentage"\s*:\s*(\d+)/);
      const company = pluck(detail, /"company"\s*:\s*"([^"]+)"/) || "an unknown company";
      const jobTitle = pluck(detail, /"jobTitle"\s*:\s*"([^"]+)"/) || "a role";
      if (fit && Number(fit) >= 85) {
        return {
          speaker: "Saqr",
          tone: "positive",
          text: `Strong hit — ${fit}% match at ${company} for "${jobTitle}". Kicking it over to the team now.`,
        };
      }
      return {
        speaker: "Saqr",
        tone: "neutral",
        text: `Spotted a ${fit ?? "??"}% match at ${company} (${jobTitle}). Adding it to the board.`,
      };
    }

    // Profile / issue sweeps.
    if (type === "run_start") {
      return { speaker: "Saqr", tone: "thinking", text: `Sweep started — I'll shout when I find something.` };
    }
    if (type === "run_end" || type.endsWith(":complete")) {
      return { speaker: "Saqr", tone: "neutral", text: `Sweep done. Back on standby.` };
    }
    if (type === "analyze") {
      return { speaker: "Saqr", tone: "thinking", text: `Cross-checking the feed against Salah's profile…` };
    }
    if (type.includes("error") || type.includes("failed")) {
      return { speaker: "Saqr", tone: "negative", text: `Ran into a snag out there: ${title}` };
    }
  }

  // ---- Qalam: Creative Lead ------------------------------------------
  if (role === "Qalam") {
    if (type === "ghostwriter:subscribe-fired") {
      const company = title.replace(/.*for\s+/, "") || "the new lead";
      return {
        speaker: "Qalam",
        tone: "thinking",
        text: `Ooh, ${company} — I have ideas. Giving it a moment…`,
      };
    }
    if (type === "ghostwriter:social-draft" || title.toLowerCase().includes("linkedin draft ready")) {
      const company = pluck(detail, /"jobId"\s*:\s*"[^"]*"[^}]*"company"\s*:\s*"([^"]+)"/) ||
        title.replace(/.*for\s+/, "").replace(/\s+\(stack:.*/, "") || "the role";
      return {
        speaker: "Qalam",
        tone: "positive",
        text: `Fresh LinkedIn draft ready for ${company}. Short, punchy, no "looking for work" vibe — take a look when you have a sec.`,
      };
    }
    if (type === "ghostwriter:error" || type.includes("error")) {
      return {
        speaker: "Qalam",
        tone: "negative",
        text: `Draft bounced — I'll try another angle. (${title.slice(0, 80)})`,
      };
    }
    if (type === "analyze") {
      return { speaker: "Qalam", tone: "thinking", text: `Working on the copy — one sec.` };
    }
    if (title.toLowerCase().includes("content") || type.includes("post")) {
      return { speaker: "Qalam", tone: "neutral", text: `New piece brewing: ${title}` };
    }
  }

  // ---- Amin: Compliance ----------------------------------------------
  if (role === "Amin") {
    if (type === "bureaucrat:ats-check" || title.toLowerCase().startsWith("ats ")) {
      const score = pluck(detail, /"score"\s*:\s*([\d.]+)/);
      const verdict = pluck(detail, /"verdict"\s*:\s*"(pass|borderline|fail)"/);
      const company = pluck(detail, /"jobId"\s*:\s*"[^"]*"[^}]*"company"\s*:\s*"([^"]+)"/) ||
        title.match(/—\s*([^(]+?)\s*\(/)?.[1] ||
        "this application";
      const missing = pluckArray(detail, "missingKeywords");
      const gap = missing.length > 0 ? missing.join(", ") : null;

      if (verdict === "pass") {
        return {
          speaker: "Amin",
          tone: "positive",
          text: `Salah, I checked the ${company} application. ATS score ${score}/10 — clean. You can submit this confidently.`,
        };
      }
      if (verdict === "fail") {
        return {
          speaker: "Amin",
          tone: "negative",
          text: `Salah, the ${company} application is at ${score}/10 — below threshold${gap ? `. Missing: ${gap}.` : "."} I would not submit this yet.`,
        };
      }
      // borderline or unknown
      return {
        speaker: "Amin",
        tone: "warning",
        text: `Salah, I checked the ${company} application. ATS score is ${score}/10${
          gap ? ` — we're missing ${gap} keywords. I wouldn't submit this yet.` : "."
        }`,
      };
    }

    if (type === "analyze" && title.toLowerCase().includes("resume")) {
      return {
        speaker: "Amin",
        tone: "thinking",
        text: `Tailoring Salah's resume for this posting — keeping the phrasing aligned with the job description.`,
      };
    }
    if (title.toLowerCase().includes("resume ready") || /resume:(generated|complete|done)/.test(title)) {
      return {
        speaker: "Amin",
        tone: "positive",
        text: `Resume ready. Formatting matches the original design, keywords are aligned with the posting.`,
      };
    }
    if (type.includes("error") || type.includes("failed")) {
      return {
        speaker: "Amin",
        tone: "negative",
        text: `Compliance check failed: ${title}. I'll retry.`,
      };
    }
  }

  // ---- System / fallback ---------------------------------------------
  if (type === "bus_event") {
    return { speaker: role, tone: "neutral", text: `Event on the wire: ${title.replace(/^Event:\s*/, "")}` };
  }
  if (type.includes("error") || type.includes("failed")) {
    return { speaker: role, tone: "negative", text: title };
  }
  return { speaker: role, tone: "neutral", text: title };
}

/**
 * Build Sifr's top-of-page "main message" from the current state. Sifr is
 * synthesised client-side — no agent actually runs — so this is the one
 * place that decides what the lead says. Intentionally one sentence.
 */
export function sifrBrief(args: {
  topCompany: string | null;
  topFit: number | null;
  atsScore: number | null;
  atsVerdict: "pass" | "borderline" | "fail" | null;
  missing: string[];
  socialDraftDone: boolean;
  resumeDone: boolean;
  scoutBusy: boolean;
  anyError: boolean;
}): { headline: string; body: string } {
  const {
    topCompany,
    topFit,
    atsScore,
    atsVerdict,
    missing,
    socialDraftDone,
    resumeDone,
    scoutBusy,
    anyError,
  } = args;

  if (anyError && !topCompany) {
    return {
      headline: "Something's off.",
      body: `Salah — we hit an error on one of the agents. Check the chatter below and let me know if you need a rerun.`,
    };
  }

  if (!topCompany) {
    if (scoutBusy) {
      return {
        headline: "Saqr is on the hunt.",
        body: `No high-fit matches yet. I'll flag the moment Saqr finds one worth chasing.`,
      };
    }
    return {
      headline: "Clear runway today.",
      body: `Nothing urgent on the board. Want me to kick off a fresh sweep?`,
    };
  }

  // A top company exists — talk about it.
  const fitPart = topFit ? `${topFit}% match at ${topCompany}` : `a hit at ${topCompany}`;

  if (atsScore !== null && atsVerdict === "pass" && resumeDone && socialDraftDone) {
    return {
      headline: `Apply to ${topCompany} today.`,
      body: `${fitPart}. Resume's tailored, LinkedIn post is drafted, ATS is clean at ${atsScore}/10. You're go for launch.`,
    };
  }

  if (atsScore !== null && atsVerdict !== "pass") {
    const gap = missing.length > 0 ? ` (gap: ${missing.join(", ")})` : "";
    return {
      headline: `${topCompany} needs a tune-up before you apply.`,
      body: `${fitPart}. Amin flagged ATS ${atsScore}/10${gap}. Qalam has${socialDraftDone ? "" : " nearly"} a post ready${resumeDone ? "; resume is done" : ""}.`,
    };
  }

  // Chain still in flight.
  return {
    headline: `Priority: ${topCompany}.`,
    body: `${fitPart}. The team is prepping your kit${
      resumeDone || socialDraftDone ? " — almost there" : ""
    }. I'll surface the go/no-go call once Amin's done with the ATS scan.`,
  };
}
