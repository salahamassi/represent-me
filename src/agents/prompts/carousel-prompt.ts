/**
 * Carousel prompt builder — turns an existing LinkedIn post (and
 * optional gem context) into the JSON deck that drives the renderer.
 *
 * Used by `ContentAIAgent.generateCarouselFromContent`. Kept in its
 * own module so prompt iteration doesn't churn the (already large)
 * agent file, and so a future Phase-5 unified prompt can compose this
 * fragment with `buildGemPrompt` without circular imports.
 */

export interface CarouselPromptInput {
  /** The LinkedIn post text Layla previously wrote — primary source. */
  postText: string;
  /** Display project name, e.g. "Bond Form" or "Trivia Game". Drives
   *  brand resolution downstream; Layla should echo it on the cover. */
  project: string;
  /** Repo business-context blurb (the same one `buildGemPrompt` uses).
   *  Optional — the post may carry enough context on its own. */
  repoContext?: string;
  /** The original gem's headline. Helps Layla pick a tighter cover
   *  title than the post hook. */
  gemTitle?: string;
  /** "What this code actually solved" — used to ground the why-bullets
   *  in real impact rather than restating the code. */
  realProblem?: string;
  /** "Why other devs would care" — used to shape the outro hook. */
  whyInteresting?: string;
  /** The angle Layla used when drafting the post — keeps the carousel
   *  tone consistent. */
  contentAngle?: string;
  /** Default footer line on each slide. Emitted on the deck so Layla
   *  can override per-post when the project tagline doesn't fit. */
  defaultFooterText?: string;
  /** The gem's implementation code. The ONLY source of truth for the
   *  code slide — Layla must copy/paste from here, never invent enum
   *  cases, method names, or types not present. Optional: when missing,
   *  the prompt instructs Layla to drop the code slide rather than
   *  fabricate. */
  codeSnippet?: string;
  /** The gem's usage example — preferred over `codeSnippet` for the
   *  code slide because readers want to see the API they'd call.
   *  Optional, same fabrication-guard rule as `codeSnippet`. */
  usageExample?: string;
}

export function buildCarouselPrompt(input: CarouselPromptInput): string {
  const {
    postText,
    project,
    repoContext,
    gemTitle,
    realProblem,
    whyInteresting,
    contentAngle,
    defaultFooterText,
    codeSnippet,
    usageExample,
  } = input;

  // Trim large inputs so the prompt stays well under the model's
  // context budget. The post is the primary source so it gets the
  // largest allotment.
  const post = postText.slice(0, 3000);
  const repo = repoContext?.slice(0, 400);
  const problem = realProblem?.slice(0, 300);
  const interesting = whyInteresting?.slice(0, 300);
  const angle = contentAngle?.slice(0, 200);
  // Gem code blocks are the only legal source for the code slide.
  // Generous budget — full gem snippets, not summaries — because
  // truncation here is what made Claude invent enum cases in the
  // first place.
  const usage = usageExample?.slice(0, 2000);
  const impl = codeSnippet?.slice(0, 2000);
  const hasGemCode = !!(usage || impl);

  const gemCodeBlock = hasGemCode
    ? `==========================================================================
GEM SOURCE CODE — VERBATIM SOURCE OF TRUTH FOR THE CODE SLIDE
==========================================================================
The code slide MUST copy/paste from these blocks. Do NOT invent enum
cases, method names, types, parameters, or comments that are not
present below. If you cannot fit a usable snippet from these blocks
into 6-22 lines, drop the code slide entirely — it is better to ship
a 3-slide deck than to fabricate code.

${usage ? `USAGE (preferred for the code slide — readers want to see the API they'd call):\n\`\`\`\n${usage}\n\`\`\`\n\n` : ""}${impl ? `IMPLEMENTATION (use only if usage is unavailable or insufficient):\n\`\`\`\n${impl}\n\`\`\`` : ""}`
    : `==========================================================================
GEM SOURCE CODE — NOT AVAILABLE
==========================================================================
No verbatim gem code was provided. DO NOT invent code. Drop the code
slide and produce a 3-slide deck (cover → why → outro) instead.`;

  const groundingBlock = [
    repo ? `REPO CONTEXT: ${repo}` : null,
    gemTitle ? `GEM TITLE: ${gemTitle}` : null,
    problem ? `REAL PROBLEM SOLVED: ${problem}` : null,
    interesting ? `WHY OTHER DEVS CARE: ${interesting}` : null,
    angle ? `CONTENT ANGLE LAYLA USED: ${angle}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `You are producing TWO outputs from one existing LinkedIn post:

  1. carouselPost  — a NEW narrative-only post body that goes ABOVE the carousel on LinkedIn. The reader sees this first; if they want the implementation, they swipe.
  2. carousel      — a 4-slide PDF carousel that carries the code + the why-bullets + the takeaway.

The existing post you were given may be code-heavy and verbose; on LinkedIn that renders as ugly raw backticks because LinkedIn doesn't preview code. The carousel solves that. Your job is to split the load: the post tells the STORY, the carousel shows the IMPLEMENTATION.

PROJECT: ${project}
${groundingBlock ? `\n${groundingBlock}\n` : ""}
EXISTING POST (source material — DO NOT echo it back verbatim):
"""
${post}
"""

${gemCodeBlock}

==========================================================================
PART 1 — carouselPost (NARRATIVE-ONLY POST BODY)
==========================================================================

The carouselPost is the LinkedIn body text. It should be PURE NARRATIVE — no code, no bullets, no markdown. Length: 600-950 chars. Structure:

  - Para 1 (HOOK):       1-2 sentences. The first 160 chars matter — that's what shows above LinkedIn's "see more" fold. Concrete tension or stakes. NOT a generic problem statement; a specific one.
  - Para 2 (STORY):      One paragraph. What was breaking. Specific, technical, in your voice.
  - Para 3 (THE FIX):    One paragraph. The insight that unlocked the fix. Lead with the principle, then briefly say how. NOT a code walkthrough.
  - Para 4 (TAKEAWAY):   One sentence. The general principle the reader should remember.
  - Pointer:             "Full pattern in the carousel ↓" or similar — one line directing readers to the deck.
  - Question:            One short open question to invite replies.
  - Hashtags:            3-5 relevant tags on a final line.

HARD RULES for carouselPost:
  - NO triple-backtick code blocks.
  - NO single backticks for inline code.
  - NO markdown (no **bold**, no _italic_, no headers).
  - NO escape sequences (no \\(, \\<, \\[, etc.).
  - NO emoji unless the source post had them.
  - All identifiers and code references go in plain prose ("the in-flight future", not \`_pendingLogout\`).

ONE-SHOT EXAMPLE — same shape, different content:

EXAMPLE INPUT (existing post):
"""
The Problem: In our multiplayer trivia game, users could trigger multiple API calls simultaneously. When sessions expired, multiple 401 responses caused concurrent logout attempts, creating race conditions and users getting stuck in loading states.

The Solution: I built a coalescing pattern... [code blocks here] ... Future<void>? _pendingLogout; ... [more code]

The Result:
• Zero race conditions
• Users always reach login
• Network layer stays decoupled

How does your team handle ...
"""

EXAMPLE OUTPUT (carouselPost):
"""
In our multiplayer trivia game, expired sessions sometimes left users stuck on a spinner forever. The bug wasn't the network — it was five concurrent logouts racing each other.

Every in-flight request hit a 401 at roughly the same time. Each 401 fired its own logout. Five callers, five logout operations, all clearing state and navigating to login simultaneously. Whoever finished last won — and "last" meant the user got stranded mid-transition.

The fix wasn't a lock or a debounce. It was recognizing that all five 401s wanted the same outcome. So instead of serializing them, I coalesced them: the first 401 starts the logout future, every subsequent 401 awaits that same future. One operation, N callers, zero races.

The principle: when concurrent callers want a shared side effect, don't queue them — let them share the in-flight work.

Full pattern in the carousel ↓

How does your team coordinate auth state with the network layer?

#Flutter #Dart #Architecture #MobileDev
"""

Notice: hook is sharp ("five concurrent logouts racing each other"), no code, no backticks, identifiers described in prose, ends with one principle + question + hashtags.

==========================================================================
PART 2 — carousel (4-SLIDE DECK)
==========================================================================

CAROUSEL STRUCTURE — produce 4 slides in this order: cover → code → why → outro. You may insert a SECOND code slide between code and why (giving 5 total) when the snippet genuinely needs splitting; cap at 6 slides total.

SLIDE-BY-SLIDE RULES:

1. COVER  — title + optional subtitle. The cover's job is to hook the swipe.
   - title:    The gem's headline as a technical claim. 4-120 chars. NOT the post's hook line; it's tighter, more specific.
   - subtitle: Optional 1-line lead, max 140 chars. The tension or the stakes — what was breaking, what the reader pays attention for.

2. CODE   — the visual centrepiece. Shiki-tokenised in a mac-window frame.
   - caption:  Optional 1-line setup ABOVE the code, max 140 chars. Pose the question the code answers.
   - code:     6-22 lines, standalone-readable. NO truncated ellipses (no "..."). Pull VERBATIM from the GEM SOURCE CODE block above — copy/paste only; do NOT invent enum cases, method names, types, parameters, or comments that are not present in those blocks. If the snippet you'd write isn't a copy/paste of those lines, you're inventing — stop and use what's actually there. If neither USAGE nor IMPLEMENTATION provides a usable 6-22 line snippet, DROP the code slide and ship a 3-slide deck (cover → why → outro). The post body is prose-only by design, so do not pull from it for code.
   - language: One of dart, swift, kotlin, typescript, javascript, java, python, objc, rust, go.
   - filename: Optional, max 60 chars (e.g. "auth_service.dart"). Skip if it'd be made-up.

3. WHY    — diamond-bulleted "why this design choice held up" panel.
   - heading: Default "Why it works". Override only if the post implies a different framing (e.g. "Why this scales", "Why QA loves it").
   - bullets: 2-4 short concrete claims. Each 3-120 chars, single line. Pull from the post's existing payoff bullets if present; otherwise distil them from the prose. Each bullet is a CLAIM, not a feature description.

4. OUTRO  — the principle the reader should remember.
   - hook:     1-2 sentences, max 180 chars. The takeaway / the principle. Independent of any specific code.
   - cta:      "Follow for more X" or similar, max 120 chars.
   - question: Optional open question to invite replies, max 220 chars. Should be answerable in one paragraph.

GLOBAL CONSTRAINTS:
- project: must be exactly "${project}" (echoed back on the deck so the renderer resolves the right brand).
- footerText: optional, max 80 chars override. ${defaultFooterText ? `Default is "${defaultFooterText}".` : "Omit unless the post implies a specific tagline."}
- All strings are PLAIN TEXT — no markdown, no backticks (except in code.code itself), no \\-escapes.
- No emojis unless they were in the original post.

OUTPUT — JSON object with this EXACT structure (and ONLY this — no prose, no markdown wrapper):

{
  "carouselPost": "<narrative-only post body, 600-950 chars, hook/story/fix/takeaway/pointer/question/hashtags as described in PART 1>",
  "carousel": {
    "project": "${project}",
    "footerText": "<optional>",
    "slides": [
      { "type": "cover", "title": "...", "subtitle": "..." },
      { "type": "code", "caption": "...", "code": "...", "language": "...", "filename": "..." },
      { "type": "why", "heading": "Why it works", "bullets": ["...", "...", "..."] },
      { "type": "outro", "hook": "...", "cta": "...", "question": "..." }
    ]
  }
}`;
}
