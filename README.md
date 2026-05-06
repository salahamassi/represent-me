# Represent Me

A multi-agent AI dashboard built with Next.js + the Claude API that automates a working software engineer's outbound career workflow — from job discovery and fit-scoring through tailored resumes, cover letters, GitHub profile maintenance, and LinkedIn-ready code-gem content.

It's a single-user system, currently running locally for one person, but the architecture is genuinely interesting and the components are individually re-purposable. This README is for the engineer who clicked through from a CV to see what's actually in here.

---

## What it does

Five specialised AI agents communicate over an event-driven pub/sub bus and share a SQLite-backed state machine. Each owns a slice of the job-hunt:

| Agent | Responsibility |
|---|---|
| **Job Matcher** (scout) | Scrapes RemoteOK, Arc.dev, and LinkedIn search → scores each posting with Claude against a structured candidate profile → buckets the queue by fit %. |
| **Resume Agent** (Kareem) | Tailors a CV per job: pulls structured analysis (`AIJobAnalysis`) from the matcher, generates Zod-validated `ResumeGeneration` JSON via Claude, renders a PDF with `pdfkit`. |
| **Content Agent** (Layla) | Mines code-gems from a curated list of GitHub repos, drafts LinkedIn / Medium / Dev.to posts, drafts cover letters, optionally renders a 1080×1350 BondInfographic PNG via Satori + Resvg + Shiki. |
| **GitHub Agent** | Audits the candidate's GitHub profile, executes fixes (repo descriptions, topics, README generation, CI repairs, fork archival) through a review/approve workflow, plus an Issue Hunter and PR Tracker. |
| **LinkedIn Agent** | Ingests exported LinkedIn data → scores profile completeness across headline / summary / recommendations / network composition / activity. |
| **Visual Lead** (Ghada) | Renders post visuals — Spider-Verse PNG via DALL-E 3 for non-gem flows; BondInfographic for gem flows. |

A separate **War Room** UI overlays the same data with a "floor plan" visualisation: each agent has a desk, a workbench, and a chat drawer; missions are state machines that move from `READY` → `IN_PROGRESS` → `KIT_READY` → `SHIPPED`.

---

## Architecture

```
                    ┌─────────────────────────────────────────────────┐
                    │              Next.js App (worker.ts)            │
                    │                                                 │
   Cron scheduler ──▶  AgentBus (in-process pub/sub)                  │
   (8 jobs, 6h)     │     │                                           │
                    │     ├─────▶ JobMatcher  ──▶ seen_jobs.fit_pct   │
                    │     ├─────▶ Kareem      ──▶ generated_resumes   │
                    │     ├─────▶ Layla       ──▶ generated_content   │
                    │     ├─────▶ Ghada       ──▶ /infographics/*.png │
                    │     ├─────▶ GitHub      ──▶ github_actions      │
                    │     └─────▶ LinkedIn    ──▶ findings/actions    │
                    │                                                 │
                    │  SQLite (better-sqlite3, 11 tables)             │
                    │  Telegram Bot (notifications + inline buttons)  │
                    │  Zernio API (LinkedIn auto-publish + R2 media)  │
                    └─────────────────────────────────────────────────┘
                              ▲
                              │ HTTP (Next.js App Router)
                              ▼
                    ┌─────────────────────────────────────────────────┐
                    │  /war-room    /jobs    /content    /profile     │
                    │  Command Bar (top-lead pin) + Floor Plan + Chat │
                    └─────────────────────────────────────────────────┘
```

Key design decisions worth calling out:

- **Event-driven, not call-stack-driven.** Agents publish/subscribe; one mission's completion (`mission:kit-ready`) auto-triggers the next downstream agent. Makes the system trivially extensible — Tariq the deadline agent was added after the bus existed without touching the others.
- **Structured outputs everywhere.** Every Claude call is wrapped with a Zod schema (`AIJobAnalysisSchema`, `ResumeGenerationSchema`, `GemImageSlotsSchema`, etc.). Parser failures retry. No string-matching downstream.
- **Per-call cost tracking.** Every Claude call logs input/output tokens and a USD estimate to `ai_usage_log`. Total spend across all dev work to date: ~$2.30.
- **Fail-closed publishing.** The Zernio publisher returns `{ok:false, error}` on any failure; the scheduler decides whether to flip the row to `published` or fall back to the manual paste flow via Telegram.
- **Gradient observability.** A single activity stream (`agent_activity_log`) captures every fetch, analyse, generate, notify, and bus-event with optional cost/duration metadata. Drives both the War Room chatter feed and the cost dashboard.

---

## Highlight: the resume pipeline

The single most-developed flow in the repo. Hardened over many iterations against real failure modes:

1. **JD acquisition.** Either the JobMatcher scrapes the full JD (LinkedIn flow uses the [browser](https://github.com/) skill — camoufox + cookie injection — to read authenticated job pages) or the user pastes a JD via the manual-lead route.
2. **Analysis.** Saqr (the matcher's analyser) emits `AIJobAnalysis` — `fitPercentage`, `matchedSkills` with evidence, `transferableSkills`, `missingSkills`, `salaryEstimate`, `resumeEmphasis[]`, `applicationTips`.
3. **Generation.** Kareem reads the candidate profile + the analysis + a featured-projects block + a tag-matched publications block, and emits `ResumeGeneration` JSON.
4. **Render.** A standalone Node script (`scripts/generate-pdf.js`) takes the JSON and writes a PDF via pdfkit with proper hyperlinks in the header, syntax-highlighted code-card fallbacks, and an employmentType suffix on contract roles.

The prompt has accumulated specific rules to defend against specific failure modes the system actually hit:

- **Relevance floor (HARD).** Never omit any role within 5 years of today. Past iterations dropped the candidate's most iOS-specific role (ITG, biometric/Keychain work) from CVs targeting iOS positions because Claude judged "iOS already covered" — broken. Today's date is now injected explicitly so the math is correct.
- **iOS-stack keep rule.** If the JD or job title mentions any of `[iOS, Swift, UIKit, SwiftUI, Objective-C, Xcode, Apple, Mobile, Tech Lead Mobile]`, every iOS-flavoured role in the profile MUST appear in the output.
- **Anti-fabrication quantification.** ≥50% of bullets should contain a number, but ONLY numbers verbatim from the candidate profile. Past iterations cheerfully invented "5,000+ drivers", "99.9% uptime", "user retention by 45%" — none of which were in the profile. The rule now lists explicit legal numbers (`100+ stars`, `145+ tests`, `47 XCTest files`, `30%`, `90%`, `thousands of users daily`, …) and forbids any others.
- **Industry-vertical bridge.** When the company operates in a vertical (telehealth, fintech, etc.), surface adjacent candidate experience in the summary AND first bullet. Famcare (mental-health teletherapy) becomes a headline asset for telehealth roles, not a footnote.
- **Release-ownership keywords.** Whenever the JD asks for "shipped 1+ app to App Store / Google Play", the relevant entry MUST include the literal phrase. ATS scanners and recruiters both look for it.
- **Employment-type pass-through.** Contract / freelance / part-time renders as a `(Contract)` suffix on the title — short tenures read as project engagements, not job-hopping.

The same prompt powers a self-contained test bench at `scripts/test-lifemd-resume.ts` so prompt changes can be regression-tested without spinning up the full agent system.

---

## Highlight: the content + image pipeline

A code-gem flow that takes a curated list of GitHub repos and produces shippable LinkedIn content end-to-end:

1. **Mining.** GitHub Agent scans the repo's source files; Claude identifies "gems" (architectural patterns, clever tricks) with `realProblem` / `whyInteresting` / `contentAngle`.
2. **Drafting.** Layla turns each gem into a platform-specific post via `generateGemKit` — produces both prose AND structured `imageSlots` (project, title, code snippet, language, why-it-works bullets) in one Claude call so they're anchored on the same reasoning pass.
3. **Rendering.** `infographic-renderer.ts` runs `JSX → Satori → SVG → Resvg → 1080×1350 PNG`. Shiki tokenises the code with the github-dark theme; Inter + JetBrains Mono fonts are loaded from `@fontsource`. Local rendering, no external API, ~hundreds of ms.
4. **Publishing.** `zernio-service.ts` uploads the PNG via Zernio's `/media` endpoint (presigned R2 PUT → `https://media.zernio.com/...`), then posts to LinkedIn. No `APP_BASE_URL` requirement — Zernio's R2 hosts the image, not your dev server.

A single source of truth: gem-mining via the scheduled flow and the `/api/content/mine` route both call the same `generateGemKit` + `renderInfographic` primitives. They produce identical output.

---

## Quickstart

Requirements: Node 23+, an Anthropic API key, optionally a Zernio account for LinkedIn auto-publishing, optionally a Telegram bot for notifications.

```bash
git clone git@github.com:salahamassi/represent-me.git
cd represent-me
npm install

# 1. Copy the example env file and fill in keys.
cp .env.example .env.local
# (or create .env.local from scratch — see "Configuration" below)

# 2. Replace src/data/profile.ts with your own profile.
#    The whole system is built around the candidate profile structure.

# 3. Run.
npm run dev     # starts next dev + the agent worker concurrently
```

Then visit `http://localhost:3000`. The War Room is at `/war-room`; the profile/CV view is at `/profile`; the content library is at `/content`.

---

## Configuration

`.env.local` (gitignored — never committed):

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-…       # Claude API key

# Optional — LinkedIn auto-publishing
ZERNIO_API_KEY=…                  # https://zernio.com
ZERNIO_API_BASE=https://zernio.com/api/v1   # default

# Optional — Telegram notifications
TELEGRAM_BOT_TOKEN=…
TELEGRAM_CHAT_ID=…

# Optional — GitHub (anonymous access works, with rate limits)
GITHUB_TOKEN=ghp_…                # personal access token

# Optional — content publishing base URL fallback
# (the Zernio media-upload path makes this optional; only set when running
# behind a reverse proxy and the worker isn't on the same host as Next.)
APP_BASE_URL=http://localhost:3000
```

---

## Repository layout

```
src/
  agents/
    base/                  # AIAgent, AgentBus, agent-runner
    ai/                    # Per-agent orchestrators (job-matcher, resume, content, github, linkedin, ghada, bureaucrat)
    schemas/               # Zod schemas for every Claude call
  app/
    api/                   # Next.js App Router routes (auto, war-room, content, jobs, …)
    war-room/              # War Room UI (the "floor plan + chat drawer" interface)
    profile/  jobs/  content/  …
  components/
    war-room/v2/           # CommandBar, FloorPlan, WorkbenchGeneric, ChatDrawer, ExpandedWorkbench
    infographics/          # BondInfographic JSX template (1080×1350)
    carousels/             # Carousel slide templates (cover/code/why/outro)
    ui/                    # shadcn/ui primitives
  data/
    profile.ts             # Candidate profile — single source of truth for every agent
    featured-projects.ts   # Curated public-facing projects (with real URLs) Kareem can cite
    medium-data.ts         # Live RSS-mirrored Medium articles (real hash URLs)
    job-preferences.ts     # Target-roles / interests for the matcher's system prompt
  lib/
    db.ts                  # better-sqlite3 + schema migrations + 50+ helper functions
    posting-schedule.ts    # AST-zone publishing window logic
    scheduler.ts           # node-cron orchestration
    telegram.ts            # Bot helpers (sendMessage, sendDocument, callback handling)
  services/
    *-service.ts           # External integrations (zernio, claude, github-api, remoteok, arcdev, linkedin, pdf, profile-pdf, profile-docx)
    infographic-renderer.ts # Satori + Resvg + Shiki PNG pipeline
scripts/
  generate-pdf.js              # Standalone pdfkit renderer (called from agents via child_process)
  generate-profile-pdf.js      # Master CV renderer
  test-lifemd-resume.ts        # End-to-end resume-pipeline test bench
  score-linkedin-batch.ts      # Bulk Saqr scoring against scraped LinkedIn JDs
worker.ts                  # Background worker (cron + telegram polling + agent bus)
```

---

## Tech stack

Next.js 16 (canary, App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Zustand · better-sqlite3 · `@anthropic-ai/sdk` · `@octokit/rest` · `pdfkit` / `pdf-lib` / `docx` · Satori + `@resvg/resvg-js` + Shiki · `node-cron` · `zod`

The worker uses `tsx watch` for hot-reload alongside `next dev`, orchestrated via `concurrently`.

---

## Honest disclaimers

- **This is a single-user system.** `src/data/profile.ts` is one specific person's profile (Salah Nahed's). Every agent is built around that structure. Multi-tenancy was deliberately out of scope.
- **The headshot is gitignored.** `salah-avatar.*` is referenced by `profile.ts` but kept out of the public repo. The avatar slot in the UI gracefully falls back to initials.
- **The DB is gitignored.** Every `.db`, `.db-wal`, `.db-shm`, and `.db.bak-*` variant is in `.gitignore`. The repo ships empty — first run creates the schema.
- **Generated artifacts are gitignored.** `data/resumes/`, `public/infographics/`, `public/wr-visuals/` all stay local. The generated PDFs contain a real CV's full contents and shouldn't be in a public repo.
- **Tests are sparse.** Two integration tests cover the mission state machine. Most "tests" are the standalone scripts under `scripts/` that exercise full end-to-end flows against the real Claude API and verify outputs.
- **Cost.** All development on this repo to date totals ~$2.30 in Claude API spend (tracked in `ai_usage_log`). Per-tailored-CV cost is roughly $0.02. Per-bulk-score-of-50-jobs is roughly $0.30.

---

## License

No explicit license — treat the code as a portfolio reference, not a kit to drop into your own project. If you find a pattern useful (the BondInfographic JSX→Satori→Resvg pipeline, the Zernio media-upload pattern, the Zod-validated agent base class, the relevance-floor prompt rules) feel free to lift it. Open an issue if you want to discuss anything specific.

— [Salah Nahed](https://github.com/salahamassi)
