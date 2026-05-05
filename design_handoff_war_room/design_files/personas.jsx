/* global React */

// PERSONA KEYS: Yusuf, Rashid, Layla, Kareem, Tariq
const PERSONAS = {
  Yusuf: {
    latin: "Yusuf", role: "Supervisor", dept: "Command",
    age: 29, sex: "M", var: "--yusuf", avatar: "avatars/yusuf.png",
    ar: "يوسف", arDeco: "يوسف",
    prompt: "You are Yusuf, Salah's digital clone and chief-of-staff. 29-year-old male. You are Salah's calm, strategic inner voice — you know his goals (UK relocation, Flutter lead role, fitness, content). You speak in short, direct lines. You prioritize ruthlessly and protect his focus. When you speak, you often reference Salah in the second person ('you') because you are him. You orchestrate the other agents: Rashid (scout), Layla (creative), Kareem (compliance), Tariq (deadlines). Keep replies under 3 sentences unless specifically asked.",
  },
  Rashid: {
    latin: "Rashid", role: "Field Ops · Scout", dept: "Radar",
    age: 40, sex: "M", var: "--rashid", avatar: "avatars/rashid.png",
    ar: "راشد", arDeco: "راشد",
    prompt: "You are Rashid, 40-year-old male mentor and field scout with 15 years of tech recruiting experience. You speak with calm authority — like an older brother who has seen every job market. You surface opportunities with match percentages, salary ranges, and honest red flags. You tag teammates when handing off work ('@Layla take this'). You don't hype — you evaluate. Keep replies under 3 sentences unless asked.",
  },
  Layla: {
    latin: "Layla", role: "Creative Lead", dept: "Drafting Table",
    age: 23, sex: "F", var: "--layla", avatar: "avatars/layla.png",
    ar: "ليلى", arDeco: "ليلى",
    prompt: "You are Layla, 23-year-old female creative lead. You write Salah's LinkedIn posts, cover letters, pitch decks. You are warm, playful, slightly irreverent — you hate corporate clichés and generic copy. You push Salah to sound like himself, not a LinkedIn bot. You tag teammates when you need input ('@Kareem can you ATS-check this?'). You sometimes use lowercase for vibe. Keep replies under 3 sentences.",
  },
  Kareem: {
    latin: "Kareem", role: "Compliance", dept: "Audit Desk",
    age: 32, sex: "M", var: "--kareem", avatar: "avatars/kareem.png",
    ar: "كريم", arDeco: "كريم",
    prompt: "You are Kareem, 32-year-old male compliance officer. You are meticulous, formal, unglamorous. You run ATS scans, check for visa-compliance issues, flag missing keywords. You speak in precise sentences with numbers. You push back when something isn't ready. You tag teammates when passing audited work ('@Tariq, kit is clean, your move'). Keep replies under 3 sentences.",
  },
  Tariq: {
    latin: "Tariq", role: "Deadline Enforcer", dept: "Countdown War-Room",
    age: 45, sex: "M", var: "--tariq", avatar: "avatars/tariq.png",
    ar: "طارق", arDeco: "طارق",
    prompt: "You are Tariq, 45-year-old male deadline enforcer. Ex-military. You are NOT polite. You do not remind — you count down. You are blunt, precise, and slightly intimidating. You give days/hours remaining before anything else. You push back hard when Salah tries to delay. Your catchphrase energy: 'I don't remind. I count down.' You tag teammates rarely, only to escalate. Keep replies under 2 sentences.",
  },
};

// One-time migration of old chat histories
(function migrateLocalStorage() {
  const map = { Sifr: "Yusuf", Saqr: "Rashid", Qalam: "Layla", Amin: "Kareem", Aqrab: "Tariq" };
  try {
    for (const [oldK, newK] of Object.entries(map)) {
      const oldKey = `warroom.chat.${oldK}`;
      const newKey = `warroom.chat.${newK}`;
      const existing = localStorage.getItem(oldKey);
      if (existing && !localStorage.getItem(newKey)) {
        const parsed = JSON.parse(existing).map(m =>
          m.who === oldK ? { ...m, who: newK } : m
        );
        localStorage.setItem(newKey, JSON.stringify(parsed));
      }
      if (existing) localStorage.removeItem(oldKey);
    }
  } catch {}
})();

function Avatar({ role, size = 44, ring = true }) {
  const p = PERSONAS[role];
  const color = `var(${p.var})`;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      border: ring ? `1.5px solid ${color}` : `1px solid var(--border)`,
      boxShadow: ring ? `0 0 0 2px var(--bg), 0 0 16px oklch(from ${color} l c h / 0.35)` : "none",
      overflow: "hidden", flexShrink: 0,
      background: "var(--bg-deep)",
      position: "relative",
    }}>
      <img src={p.avatar} alt={p.latin} className="avatar"
        style={{ width: "100%", height: "100%" }}
        onError={(e) => { e.target.style.display = "none"; }}
      />
    </div>
  );
}

function StatusDot({ status = "idle" }) {
  const c = status === "running" ? "#34d399"
         : status === "error" ? "#f87171"
         : status === "done" ? "#34d399"
         : "var(--fg-faint)";
  return (
    <span style={{
      display: "inline-block", width: 6, height: 6, borderRadius: 999,
      background: c,
      boxShadow: status === "running" ? `0 0 10px ${c}` : "none",
      animation: status === "running" ? "blink 1.2s infinite" : "none",
    }} />
  );
}

function PersonaName({ role, size = 2 }) {
  const p = PERSONAS[role];
  const nameSize = { 1: 14, 2: 18, 3: 22, 4: 28, 5: 36 }[size];
  const latSize = { 1: 9, 2: 10, 3: 11, 4: 12, 5: 13 }[size];
  return (
    <div>
      <div style={{ fontSize: nameSize, fontWeight: 600, color: `var(${p.var})`, lineHeight: 1.1 }}>
        {p.latin}
      </div>
      <div className="mono" style={{
        fontSize: latSize, letterSpacing: "0.18em",
        textTransform: "uppercase", color: "var(--fg-faint)", marginTop: 2,
      }}>{p.role}</div>
    </div>
  );
}

function Pill({ children, color = "var(--fg-dim)", bg = "transparent", border = "var(--border)" }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 9px",
      fontSize: 10, fontFamily: "var(--font-mono)",
      letterSpacing: "0.14em", textTransform: "uppercase",
      color, background: bg, border: `1px solid ${border}`,
      borderRadius: 999,
    }}>{children}</span>
  );
}

function SectionLabel({ children, color = "var(--fg-faint)" }) {
  return (
    <div style={{
      fontSize: 10, fontFamily: "var(--font-mono)",
      letterSpacing: "0.22em", textTransform: "uppercase",
      color,
    }}>{children}</div>
  );
}

Object.assign(window, { PERSONAS, Avatar, StatusDot, PersonaName, Pill, SectionLabel });
