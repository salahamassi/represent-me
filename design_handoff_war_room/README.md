# Handoff: War Room — Agent Squad Command Center

## Overview

"War Room" is Salah's personal career-ops command center — a desktop-first app where 5 AI agent personas coordinate his UK relocation, Flutter job applications, scholarship deadlines, IELTS prep, and content/fitness goals. Each agent has a distinct personality, role, Arabic + Latin name, and workbench. They talk to each other (A2A messaging) and to Salah (chat drawer) in real time.

This handoff contains **design references** for three main surfaces:
1. **Floor Plan** — inhabited office view where each agent has a desk. Click-to-chat.
2. **Tariq Workbench** — template for a per-agent full workbench (countdown + deadline stack).
3. **Yusuf Brief** — daily hero banner (desktop) + mobile glance view.

## About the Design Files

The files in `design_files/` are **HTML/React prototypes** showing intended look, layout, typography, motion, and interaction. They are NOT production code to ship directly. Your task is to **recreate these designs in the target app's existing environment** — using its component library, state management, routing, and design tokens. If no app environment exists yet, choose the most appropriate framework (we'd suggest **Next.js + Tailwind** or **React Native + Reanimated** if this is also going mobile) and implement there.

The prototype uses inline React + Babel from CDN for rapid iteration — don't carry that forward. Use real build tooling.

## Fidelity

**High-fidelity (hifi).** Colors, typography, spacing, motion timing, and copy are final-intent. Recreate pixel-perfect using the codebase's design tokens — but first map our tokens (below) to yours. If your codebase has no design system yet, lift our tokens directly.

---

## The 5 Personas

Each persona has a fixed identity. Treat these as first-class entities in the data model — don't hard-code them in components.

| Key | Latin | Arabic | Role | Dept | Age | Sex | Color token |
|-----|-------|--------|------|------|-----|-----|-------------|
| `Yusuf` | Yusuf | يوسف | Supervisor / Chief-of-Staff | Command | 29 | M | `--yusuf` (purple) |
| `Rashid` | Rashid | راشد | Field Ops · Scout | Radar | 40 | M | `--rashid` (blue) |
| `Layla` | Layla | ليلى | Creative Lead | Drafting Table | 23 | F | `--layla` (pink/red) |
| `Kareem` | Kareem | كريم | Compliance Officer | Audit Desk | 32 | M | `--kareem` (amber) |
| `Tariq` | Tariq | طارق | Deadline Enforcer | Countdown War-Room | 45 | M | `--tariq` (red-orange) |

Each persona needs:
- `latin`, `ar` (Arabic name), `role`, `dept`, `age`, `sex`, `avatar` (PNG portrait)
- `prompt` — system prompt defining voice/persona for LLM calls (exact strings in `personas.jsx`)
- `var` — CSS custom property for their accent color

**Avatars** are photographed portraits (not illustrations). PNGs included in `design_files/avatars/`. Each is masked to a circle with a colored 1.5px border ring in their accent color + soft glow halo.

---

## Screens / Views

### Screen 1 · Floor Plan (main surface)

**File:** `floor-plan.jsx`
**Size:** 1280 × 900 (desktop-only; this is the command-center view)

**Purpose:** Live view of the agent squad. Salah sees who's working, what they're doing, and the messages passing between them. He clicks any desk to open a chat with that agent.

**Layout:**
- Outer container: 1280×900, padding 20px, rounded 18px, border 1px `--border`, gradient bg from `--bg-2` → `--bg-deep`
- **Top bar** (flex, space-between, 48px tall):
  - Left: "WAR ROOM" overline (10px mono, 0.3em tracking, `--fg-faint`) + "Floor Plan — Live" title (17px/600) + green "5 AGENTS ONLINE" pill
  - Right: Theme toggle (dark/light pill), two chain-trigger buttons (`▶ LifeMD Sprint`, `▶ IELTS Pressure`), Intensity Dial (4-step: 0 Silent / 1 Focus / 2 Standard / 3 High)
- **Floor area** (flex:1, rounded 14px, overflow hidden):
  - 40×40px grid pattern overlay, masked with radial ellipse
  - Corner labels (mono 9px, 0.3em tracking): "↖ NW · SCOUTING", "NE · CREATIVE ↗", "↙ SW · ENFORCEMENT", "SE · COMPLIANCE ↘"
  - Radial purple glow at top-center (Yusuf's command position)
- **Bottom:** Radio Chatter log, 110px tall (see below)

**Desk positions (absolute, px from top-left of floor area):**
```
Yusuf   (Command):   x=490 y=110 w=220 h=120  — top center
Rashid  (Radar):     x=160 y=300 w=240 h=130  — mid left
Layla   (Drafting):  x=800 y=300 w=240 h=130  — mid right
Kareem  (Audit):     x=800 y=490 w=240 h=130  — bottom right
Tariq   (Countdown): x=160 y=490 w=240 h=130  — bottom left
```

**Desk card anatomy:**
- Rounded 12px, padding 10px, 1px border in agent's accent color when busy, `--border` when idle
- **Label tab** top-left (−9px): dept label (e.g. "COMMAND"), mono 9px, bg `--bg`, border `--border`, 4px radius
- **"↗ OPEN" hint** top-right (−9px): indicates clickable
- **Notification dot** top-right corner: 14×14 green (`#34d399`) circle with 3px bg ring + glow, pulses via `breathe` animation (only when agent has new output for Salah)
- **Avatar** (44px circle) + name block:
  - Latin name 17px/600 in accent color, glowing text-shadow when busy
  - Role mono 9px, 0.18em tracking, uppercase, `--fg-dim`
- **StatusDot** top-right of name row: 6×6 green dot with glow when running
- **Task line** (below divider, 10px top padding, border-top `--border`): 11px current task, min-height 30px
- **Busy glow overlay**: radial gradient from desk's top-center in its accent color at 25% opacity, breathe animation

**Connection lines (SVG under desks, z-index 5):**
- All 20 pairs drawn at 0.5px `--grid-line` (faint)
- Active edges: 1.5px in from-agent's color, dashed `2 6`, blink animation

**Packets (animated handoff labels):**
- 40×22 rounded 4px pill traveling from desk-A center → desk-B center
- 1.5s cubic-bezier transition
- Content: short label like "Kit ready", mono 9px uppercase, dark text on accent-color bg
- Box-shadow: 24px glow in packet color + drop shadow
- Fades out at arrival (opacity → 0)

**Chain animations:** Scripted beat sequences (see `CHAIN_SCRIPTS` in `floor-plan.jsx`) that animate over ~8–10 seconds:
- Each beat: 1400ms apart
- Per beat: set `activeEdges`, toggle `busyDesks`, update `tasks`, maybe add packet, append chatter message
- Two scripts included: "LifeMD Sprint" (7 beats, scout→supervisor→creative→compliance→enforcer→Salah) and "IELTS Pressure" (4 beats)

**Intensity Dial** auto-runs chains on interval:
- 0 Silent: off
- 1 Focus: every 30s
- 2 Standard: every 15s
- 3 High: every 8s

**On desk click:**
1. Clear that agent's notification
2. Expand inline workbench panel (700px wide, slides in from left with `expandIn` keyframe — opacity 0 + scale 0.85 → opacity 1 + scale 1, 400ms cubic-bezier(0.34, 1.56, 0.64, 1))
3. After 350ms, open ChatDrawer on right (440px wide)
4. Close button returns both

---

### Screen 2 · Expanded Workbench (overlay, on desk click)

**File:** within `floor-plan.jsx` (`ExpandedWorkbench`, `GenericWorkbench`, `TariqInlineWorkbench`)

**Layout:**
- Absolute positioned over floor, 700px × (floor-height − 40), top-left
- z-index 40, pointer-events on (but overlay backdrop has pointer-events none so clicks on the floor still work elsewhere)
- Rounded 14px, border 1px agent color, shadow: 1px color inset + 40px 80px black drop + 80px color glow
- **Header:** avatar 84px + Latin name 38px/600 in color with glow + role overline + age/sex/dept + huge decorative Arabic glyph (80px, 20% opacity of agent color) floating right
- **Body:** differs per agent — `TariqInlineWorkbench` has live-ticking countdown + deadline stack; others use `GenericWorkbench` with "Now Working On" card + queue of 3 items + metric block

---

### Screen 3 · Chat Drawer (right-side slide-in)

**File:** `chat-drawer.jsx`
**Size:** 440px wide, full floor-area height

**Purpose:** Persistent threaded chat with one agent. Backed by real LLM (`window.claude.complete` in prototype — **replace with your backend LLM endpoint**).

**Layout:**
- Absolute top:0 right:0 bottom:0, z-index 60, bg `--bg-2`, left border 1px agent color + 20px shadow glow
- Transform translateX(100%) when closed, translateX(0) when open, 350ms cubic-bezier(0.65, 0, 0.35, 1)
- Backdrop scrim (z-index 50) at 40% black, fades in/out with drawer, click-to-close
- **Header** (padding 16/20, border-bottom, top-down gradient of agent color at 15% → 0%):
  - Avatar 56px + Latin name 22px/600 in agent color + role mono 10px + age/sex + close X (28×28 bordered button)
- **Messages area** (flex:1, overflow-y auto, slim scrollbar, padding 16/20, gap 10):
  - Empty state: centered "Direct line to <Name>" in agent color + short flavor line (see `emptyStateLine` map in `chat-drawer.jsx`)
  - Bubbles: agent message = left-aligned, 28px avatar + speech bubble in agent color @ 10% opacity with 30% border; user message = right-aligned, "S" monogram tile + neutral panel bubble
  - Typing indicator while awaiting LLM: mono "<NAME> IS TYPING" + 3 pulsing dots in agent color
- **Composer** (padding 14, border-top):
  - Input + Send button in a rounded container, input transparent, send button fills with agent color when text present

**State:**
- Messages persisted to `localStorage` under `warroom.chat.<role>`, last 40 kept
- Each message: `{who, text, ts}` (+ `error` flag on failures)

**LLM call shape:**
```js
// System prompt:
PERSONAS[role].prompt + " You are speaking in a chat drawer inside Salah's War Room command center. Stay in character."
// Transcript: last 12 messages joined as "who: text\n"
// Single user-role message sent to the model containing both
```
Keep the exact persona prompts from `personas.jsx` — they define each agent's voice.

---

### Screen 4 · Radio Chatter (bottom of floor plan)

**File:** `chat-drawer.jsx` (`RadioChatter` component)
**Size:** 110px tall, full width of floor plan

**Purpose:** Live log of last 6 A2A messages flying between agents. Scrolls newest-at-top.

**Layout:**
- Rounded 10px, `--bg-deep`, border `--border`, padding 10/16
- Header strip: "RADIO CHATTER" mono 9px 0.3em tracking + green "● LIVE" right-aligned, bottom-border dashed
- Rows (mono 11px, column-reverse flex, gap 2px):
  - `[HH:MM:SS] [FROM] → [TO]  [message]`
  - FROM colored in their accent; TO in `--fg-dim`; message in `--fg`
  - Opacity fades older messages (1 − i × 0.13)

---

### Screen 5 · Tariq Workbench (full)

**File:** `tariq-workbench.jsx`
**Size:** 960 × 640

Template for a full-page per-agent view. Tariq is the extreme case; replicate pattern for others.

**Layout:**
- 28px padding, rounded 18px, gradient bg with red radial top-right glow at 12% opacity
- Top-edge hairline: horizontal gradient (transparent → tariq red → transparent) at 0.6 opacity
- **Hero row** (space-between):
  - Left: 96px avatar + huge 96px Arabic glyph "طارق" in tariq red with 40px glow + "TARIQ · طارق" mono label + "Deadline Enforcer" title + 45M/countdown war-room overline + italic quote ("I don't remind. I count down...")
  - Right: "ENFORCING" pill + "5 ACTIVE · 0 MISSED · 23 YTD" mono stats
- **Primary countdown card** (space-between):
  - Left: "Primary Target · الهدف الأول" label + "IELTS Academic — Band 7.0" + location/date subtext
  - Right: 4 `CountdownBlock`s (Days / Hours / Minutes / Seconds)
    - Each 70px wide min, 38px mono bold tabular number + 9px mono label, panel-2 bg
    - Days block has "critical" tone: tariq-red color + 20px text-shadow glow + tinted border
- **Grid** (2fr 1fr, flex:1):
  - Left: "Deadline Stack" + 5 rows sorted by urgency, each with 3px left-border color-coded (urgent ≤14D red, warn ≤45D amber, else blue), progress bar showing % of 180-day window elapsed, days-remaining in mono bold on right
  - Right: "If Today Slips" consequences list (3 items, each with red `--tariq` cost line in mono 10px) + "Escalate to Yusuf →" button

**Live ticker:** Countdown uses `setInterval(1000)` against a memoized target timestamp. Days/hours/mins/secs computed from diff.

---

### Screen 6 · Yusuf Brief (desktop hero + mobile)

**File:** `yusuf-brief.jsx`

#### Desktop variant — 1200 × ~300
Hero banner at top of Salah's main dashboard. Morning brief from his digital-clone supervisor.
- Grid: `auto auto 1fr auto` — avatar 120px, giant 160px Arabic "يوسف" with 60px purple glow, title/copy block, status pills column
- Title: "Apply to **LifeMD** today." (LifeMD in yusuf purple) — 36px/600, −0.02em letter-spacing, text-wrap pretty
- Copy: max 580px, 15px `--fg-dim`, mentions countdown in tariq red mono
- Right pills: 3 key metrics (lead %, deadline, IELTS days), color-coded by source agent

#### Mobile variant — 390 × 844
- Rounded 44px phone frame
- Status bar (mono 11px)
- **Yusuf banner card** at top: gradient from purple → transparent, avatar + 72px Arabic + bold CTA + supporting copy
- **Quick reads** — 3 agent cards (Tariq / Rashid / Layla) each with avatar + Arabic + Latin + one-line update
- Bottom tab bar: Brief · Floor · Team · Logs (Brief active in yusuf purple)

---

## Interactions & Behavior

### Global
- **Theme toggle**: `data-theme` attribute on `<html>`, CSS vars swap entirely (see Design Tokens)
- **Scale-to-fit**: The prototype uses a custom `DesignCanvas` to pan/zoom artboards — you don't need this in production. Each screen renders at its design size.

### Floor Plan specific
- **Desk hover:** `translateY(-2px)` 200ms
- **Active edges blink:** 1.2s linear infinite on the dash pattern
- **Notification pulse:** `breathe` keyframes (scale 1→1.04, opacity 0.55→1) 1.5s ease-in-out
- **Packet travel:** 1500ms cubic-bezier(0.65, 0, 0.35, 1) on `left`/`top`; opacity fades to 0 on arrival
- **Expanded workbench entry:** `expandIn` keyframes — 400ms cubic-bezier(0.34, 1.56, 0.64, 1) — scale 0.85 + translateY(12) + opacity 0 → rest
- **Chat drawer slide:** `translateX(100% → 0)` 350ms cubic-bezier(0.65, 0, 0.35, 1)

### Chain animation protocol
Chains are pure-JS timelines of beats. Each beat looks like:
```js
{
  from, to,                    // who's speaking
  text,                        // chatter line
  kind: "msg",
  edges: [[from, to], ...],    // edges to highlight
  busy: [roles],               // desks to mark busy (Yusuf always busy)
  tasks: { role: "new task" }, // updates to display
  notifications: [roles],      // green pulse on these desks
  packet: { from, to, color, label },  // optional flying packet
}
```
Two scripts included. Add more by pushing to `CHAIN_SCRIPTS`.

### Chat drawer protocol
1. User types → press Enter or click Send
2. Append user message to list + persist
3. Show "typing" state, disable input
4. Build system prompt from persona + last 12 msgs of transcript
5. Call LLM; append response on success, error-flagged bubble on failure
6. Persist + scroll to bottom

---

## State Management

Minimum state surface (use your app's patterns — Zustand, Redux, React Query, whatever):

**Floor Plan state:**
- `intensity: 0|1|2|3`
- `busyDesks: Set<role>`
- `activeEdges: [[from, to], ...]`
- `packets: [{id, from, to, color, label}]`
- `notifications: Set<role>`
- `tasks: Record<role, string>` — current-task line per desk
- `chatter: [{id, from, to, text, time}]` — A2A log
- `expandedAgent: role | null`
- `chatAgent: role | null`

**Chat state (per agent, persisted):**
- `messages[role]: [{who, text, ts, error?}]`
- `input[role]: string`
- `busy[role]: boolean`

**Theme:**
- `theme: 'dark' | 'light'` on `<html data-theme="">`

---

## Design Tokens

All tokens are **oklch** — use them directly or map to your existing scale.

### Dark theme (default)
```css
--bg:         oklch(0.14 0.02 260);
--bg-2:       oklch(0.18 0.025 260);
--bg-deep:    oklch(0.09 0.015 260);
--panel:      oklch(0.22 0.02 260 / 0.5);
--panel-2:    oklch(0.1 0.02 260 / 0.7);
--border:     oklch(1 0 0 / 0.08);
--border-strong: oklch(1 0 0 / 0.18);
--fg:         oklch(0.98 0.005 260);
--fg-dim:     oklch(0.7 0.015 260);
--fg-faint:   oklch(0.5 0.02 260);
--grid-line:  oklch(1 0 0 / 0.025);
```

### Light theme (persona colors darkened for contrast)
```css
--bg:      oklch(0.97 0.006 260);
--bg-2:    oklch(0.94 0.008 260);
--bg-deep: oklch(0.9 0.01 260);
--panel:   oklch(1 0 0 / 0.85);
--panel-2: oklch(0.98 0.005 260 / 0.95);
--border:  oklch(0.25 0.01 260 / 0.12);
--fg:      oklch(0.18 0.015 260);
--fg-dim:  oklch(0.35 0.018 260);
--fg-faint: oklch(0.5 0.018 260);
```

### Persona colors

| Var | Dark | Light |
|-----|------|-------|
| `--yusuf`  | oklch(0.65 0.2 290)  | oklch(0.38 0.22 290) |
| `--rashid` | oklch(0.72 0.16 230) | oklch(0.38 0.18 230) |
| `--layla`  | oklch(0.7 0.18 10)   | oklch(0.4 0.22 10)   |
| `--kareem` | oklch(0.78 0.15 75)  | oklch(0.42 0.16 70)  |
| `--tariq`  | oklch(0.65 0.22 25)  | oklch(0.42 0.22 25)  |

Hex fallbacks if your stack doesn't grok oklch yet:
- yusuf purple ≈ `#8B6BF0`
- rashid blue ≈ `#4A9DE8`
- layla pink ≈ `#E87788`
- kareem amber ≈ `#D4A657`
- tariq red-orange ≈ `#D9653A`

(Use a color-conversion tool for exact — or polyfill oklch via `@csstools/postcss-oklab-function`.)

### Typography
- **UI:** Inter — 400/500/600/700
- **Mono:** JetBrains Mono — 400/500/600 (all mono labels use 0.18–0.3em letter-spacing + uppercase)
- **Arabic display:** Reem Kufi — 700 (modern kufic, all headline Arabic)
- **Arabic body:** Amiri — 700 (used rarely, for secondary Arabic)

### Spacing
No strict scale — prototype uses ad-hoc px values (typically 4/6/8/10/12/14/16/18/20/24/28). Map to your spacing scale (4px base is close enough).

### Radii
`14px` panels / `10–12px` cards / `6–8px` inputs and small chips / `4px` mono tags / `999px` pills / `44px` phone frame / `50%` avatars

### Shadows / glows
Glow recipe for active/busy states:
```css
box-shadow:
  0 0 0 1px <color>,
  0 0 40px oklch(from <color> l c h / 0.3),
  0 16px 40px oklch(0 0 0 / 0.35);
```
Text-glow:
```css
text-shadow: 0 0 12px oklch(from <color> l c h / 0.35);
```

### Keyframes
```css
@keyframes breathe { 0%,100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 1; transform: scale(1.04); } }
@keyframes blink   { 50% { opacity: 0.2; } }
@keyframes expandIn { 0% { opacity: 0; transform: scale(0.85) translateY(12px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
```

---

## Assets

- **Avatars** (`design_files/avatars/*.png`): 5 photographed circular portraits, ~512×512 each. Yusuf / Rashid / Layla / Kareem / Tariq. Swap for your own if you have proper render pipeline; these are working references.
- **No icons used** — the design deliberately avoids iconography, leaning on typography, color, and Arabic calligraphy instead.
- **Fonts**: Google Fonts (Inter, JetBrains Mono, Reem Kufi, Amiri). Self-host or import as appropriate.

---

## Content / Copy

All copy in the prototype is placeholder-quality but correctly voiced for each persona. Review `personas.jsx` `prompt` field for the exact voice guide per agent. Highlights:

- **Yusuf** (supervisor): calm, ≤3 sentences, "you"-voice (he IS Salah)
- **Rashid** (scout): 40yo mentor, evaluates don't hype, always gives match % + salary + red flags
- **Layla** (creative): 23yo, lowercase-for-vibe occasionally, anti-corporate-cliché, uses emoji sparingly
- **Kareem** (compliance): formal, precise, numbers-heavy, pushes back when not ready
- **Tariq** (enforcer): NOT polite, ex-military, counts down don't remind, catchphrase "I don't remind. I count down."

Keep these voices intact when generating LLM responses. The system prompts in `personas.jsx` are already tuned.

---

## Files

```
design_files/
├── War Room v2.html           Entry point — wires everything
├── styles.css                 All CSS vars + global styles + keyframes
├── personas.jsx               Persona definitions + Avatar + Pill + StatusDot + SectionLabel
├── floor-plan.jsx             Floor plan, desks, packets, chains, intensity dial, expanded workbench
├── chat-drawer.jsx            Chat drawer, ChatBubble, RadioChatter
├── tariq-workbench.jsx        Tariq full workbench + card variant (template for other agents)
├── yusuf-brief.jsx            Desktop hero + mobile glance
├── design-canvas.jsx          Pan/zoom canvas — NOT needed in production
└── avatars/*.png              5 portrait assets
```

---

## Implementation Notes for Claude Code

1. **Start with the token system.** Drop all CSS vars from `styles.css` into your design system first. Everything else is downstream of this.
2. **Typography loads matter.** Reem Kufi for Arabic display is the whole identity — don't substitute Noto Kufi Arabic without visual review.
3. **The persona data model is the spine.** Make it a single source of truth (JSON/TS const). Don't let individual components define persona strings.
4. **Motion is part of the design, not polish.** The breathe/blink/expandIn animations, packet flights, and chain timing carry the "inhabited" feeling. If you drop them, the design loses its point.
5. **The prototype's `window.claude.complete` is a stub.** Wire to your actual LLM endpoint (Anthropic API, OpenAI, whatever). Respect the per-persona system prompt.
6. **Don't port the `DesignCanvas` component.** It's only for presenting artboards in the prototype.
7. **Mobile:** only the Yusuf Brief mobile view is designed. The Floor Plan is desktop-only by design (it's a command center). Build a simplified mobile shell later — or use the mobile Brief as the primary mobile surface and hide the floor plan behind a "Team" tab.
8. **LocalStorage for chat persistence** is prototype-only. Move to real storage (DB keyed by user + agent).
9. **Chain scripts are scripted timelines.** In production, A2A messages would emerge from real agent orchestration — the chain system is only for demo/marketing. Keep the Radio Chatter UI and hook it to your real event stream.

---

## Open Questions for Product

Before shipping, confirm with Salah:
- Are the 5 personas final, or will he want to rename/add more? (Design accommodates adding a 6th desk easily — floor has room.)
- How persistent is persona voice across sessions? (Keep prompts stable; don't let them drift.)
- Does chat drawer need attachments / image upload / voice?
- Does he want the chain-trigger buttons in production? (They're demo affordances.)
