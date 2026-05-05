const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

interface InlineButton {
  text: string;
  callback_data: string;
}

export function isConfigured(): boolean {
  return BOT_TOKEN.length > 0 && CHAT_ID.length > 0;
}

export async function sendMessage(
  text: string,
  inlineKeyboard?: InlineButton[][]
): Promise<boolean> {
  if (!isConfigured()) {
    console.log("[Telegram] Not configured, skipping message:", text.slice(0, 80));
    return false;
  }

  try {
    const body: Record<string, unknown> = {
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML",
    };

    if (inlineKeyboard) {
      body.reply_markup = JSON.stringify({ inline_keyboard: inlineKeyboard });
    }

    const res = await fetch(`${API_BASE}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[Telegram] Send failed:", err);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[Telegram] Send error:", err);
    return false;
  }
}

export async function sendJobAlert(
  jobs: {
    id: string;
    title: string;
    company: string;
    fitPercentage: number;
    url: string;
    matchedSkills: string[];
    missingSkills: string[];
  }[]
): Promise<boolean> {
  if (jobs.length === 0) return true;

  const header = `<b>🎯 ${jobs.length} new job match${jobs.length > 1 ? "es" : ""} found!</b>\n`;

  const jobLines = jobs
    .map((job) => {
      const matched = job.matchedSkills.slice(0, 5).join(", ");
      const missing = job.missingSkills.slice(0, 3).join(", ");
      return [
        `\n<b>${job.fitPercentage}% fit — ${job.title}</b>`,
        `Company: ${job.company}`,
        `Matched: ${matched}`,
        missing ? `Missing: ${missing}` : "",
        `<a href="${job.url}">View Job</a>`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n---\n");

  const text = header + jobLines;

  const keyboard = jobs.map((job) => [
    { text: `Apply: ${job.title.slice(0, 20)}`, callback_data: `apply:${job.id}` },
    { text: "Dismiss", callback_data: `dismiss:${job.id}` },
  ]);

  return sendMessage(text, keyboard);
}

export async function sendContentDraft(
  draft: string,
  contentId: number,
  suggestionTitle: string
): Promise<boolean> {
  const text = [
    `<b>📝 LinkedIn Post Draft Ready</b>`,
    `Topic: <i>${suggestionTitle}</i>`,
    ``,
    `---`,
    draft.slice(0, 3500),
    `---`,
    ``,
    `<i>Review and post on LinkedIn when ready.</i>`,
  ].join("\n");

  const keyboard = [
    [
      { text: "Approve", callback_data: `content_approve:${contentId}` },
      { text: "Reject", callback_data: `content_reject:${contentId}` },
    ],
  ];

  return sendMessage(text, keyboard);
}

export async function sendAgentSummary(
  agentName: string,
  findingsCount: number,
  highlights: string[]
): Promise<boolean> {
  const text = [
    `<b>🤖 ${agentName} completed</b>`,
    `Found ${findingsCount} items.`,
    "",
    ...highlights.map((h) => `• ${h}`),
  ].join("\n");

  return sendMessage(text);
}

let lastUpdateId = 0;

export async function pollUpdates(): Promise<
  { type: string; id: string }[]
> {
  if (!isConfigured()) return [];

  try {
    const res = await fetch(
      `${API_BASE}/getUpdates?offset=${lastUpdateId + 1}&timeout=1`
    );
    if (!res.ok) return [];

    const data = await res.json();
    const results: { type: string; id: string }[] = [];

    for (const update of data.result || []) {
      lastUpdateId = update.update_id;

      if (update.callback_query) {
        const callbackData = update.callback_query.data as string;
        const [type, id] = callbackData.split(":");

        // Acknowledge the callback
        await fetch(`${API_BASE}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callback_query_id: update.callback_query.id,
            text: "Got it!",
          }),
        });

        results.push({ type, id });
      }
    }

    return results;
  } catch {
    return [];
  }
}

export async function sendTestMessage(): Promise<boolean> {
  return sendMessage(
    "<b>🟢 Represent Me Bot is connected!</b>\n\nYour AI agents are ready to work."
  );
}

export async function sendDocument(
  filePath: string,
  caption: string,
  inlineKeyboard?: InlineButton[][]
): Promise<boolean> {
  if (!isConfigured()) {
    console.log("[Telegram] Not configured, skipping document:", filePath);
    return false;
  }

  try {
    const fs = await import("fs");
    const path = await import("path");

    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const formData = new FormData();
    formData.append("chat_id", CHAT_ID);
    formData.append("caption", caption);
    formData.append("parse_mode", "HTML");
    formData.append("document", new Blob([fileBuffer]), fileName);

    if (inlineKeyboard) {
      formData.append("reply_markup", JSON.stringify({ inline_keyboard: inlineKeyboard }));
    }

    const res = await fetch(`${API_BASE}/sendDocument`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[Telegram] sendDocument failed:", err);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[Telegram] sendDocument error:", err);
    return false;
  }
}

// --- Issue Hunter notifications ---

export async function sendIssueAlert(
  contributionId: number,
  issue: {
    title: string;
    repoOwner: string;
    repoName: string;
    url: string;
    language?: string;
  },
  analysis: {
    issueType: string;
    difficulty: string;
    estimatedHours: number;
    skillMatch: number;
    approachSummary: string;
    approachSteps: string[];
    learningValue: string;
  }
): Promise<boolean> {
  const difficultyEmoji = {
    beginner: "🟢",
    intermediate: "🟡",
    advanced: "🔴",
  }[analysis.difficulty] || "⚪";

  const text = [
    `<b>🏆 New Challenge for You!</b>`,
    ``,
    `<b>${issue.title}</b>`,
    `Repo: ${issue.repoOwner}/${issue.repoName}${issue.language ? ` (${issue.language})` : ""}`,
    `Type: ${analysis.issueType} | ${difficultyEmoji} ${analysis.difficulty} | ~${analysis.estimatedHours}h`,
    `Skill Match: ${analysis.skillMatch}%`,
    ``,
    `<b>How to solve it:</b>`,
    analysis.approachSummary.slice(0, 200),
    ``,
    `<b>Steps:</b>`,
    ...analysis.approachSteps.slice(0, 4).map((s, i) => `${i + 1}. ${s}`),
    ``,
    `<b>You'll learn:</b> ${analysis.learningValue.slice(0, 100)}`,
    ``,
    `<a href="${issue.url}">View Issue</a>`,
  ].join("\n");

  const keyboard = [
    [
      { text: "I'm Interested!", callback_data: `issue_interested:${contributionId}` },
      { text: "Later", callback_data: `issue_later:${contributionId}` },
      { text: "Dismiss", callback_data: `issue_dismiss:${contributionId}` },
    ],
  ];

  return sendMessage(text, keyboard);
}

export async function sendPRUpdate(
  contribution: {
    issue_title: string;
    repo_owner: string;
    repo_name: string;
    pr_url?: string | null;
  },
  updateType: "pr_opened" | "pr_merged"
): Promise<boolean> {
  if (updateType === "pr_opened") {
    return sendMessage(
      [
        `<b>🚀 PR Opened!</b>`,
        ``,
        `Your PR for "${contribution.issue_title}" in ${contribution.repo_owner}/${contribution.repo_name} is now open.`,
        contribution.pr_url ? `<a href="${contribution.pr_url}">View PR</a>` : "",
        ``,
        `📝 Generating a LinkedIn post about your contribution...`,
      ].filter(Boolean).join("\n")
    );
  }

  return sendMessage(
    [
      `<b>🎉 PR Merged! Congratulations!</b>`,
      ``,
      `Your contribution to "${contribution.issue_title}" in ${contribution.repo_owner}/${contribution.repo_name} has been merged!`,
      contribution.pr_url ? `<a href="${contribution.pr_url}">View PR</a>` : "",
      ``,
      `📝 Generating content suite: LinkedIn post + Medium article + Dev.to cross-post...`,
    ].filter(Boolean).join("\n")
  );
}

/**
 * Send the auto-generated carousel PDF as a Telegram document so the
 * user gets a phone-readable preview of the deck alongside the post
 * draft. Fires from the cron mining loop right BEFORE
 * `sendCodeGemDraft` so the chat order reads: PDF (visual) → post
 * text + approve/reject buttons (action).
 *
 * Caption is intentionally brief — the document carries the content.
 * No inline keyboard here: the approve/reject buttons live on the
 * subsequent post-draft message so a single tap covers the row.
 */
export async function sendCarouselPreview(
  gem: { title: string; repoName: string },
  pdfPath: string,
  contentId: number,
  slideCount: number,
  brandId?: string | null
): Promise<boolean> {
  const caption = [
    `🎨 <b>Carousel preview</b>`,
    `<i>${gem.title}</i>`,
    `${gem.repoName} · ${slideCount} slides${brandId ? ` · brand: ${brandId}` : ""}`,
    ``,
    `<i>Content #${contentId}. Approve below ↓</i>`,
  ].join("\n");
  return sendDocument(pdfPath, caption);
}

export async function sendCodeGemDraft(
  gem: { title: string; repoName: string; gemType: string },
  draft: string,
  contentId: number
): Promise<boolean> {
  const text = [
    `<b>💎 Code Gem Found!</b>`,
    ``,
    `<b>${gem.title}</b>`,
    `From: ${gem.repoName} | Type: ${gem.gemType}`,
    ``,
    `---`,
    draft.slice(0, 3000),
    `---`,
    ``,
    `<i>Ready to post?</i>`,
  ].join("\n");

  const keyboard = [
    [
      { text: "Approve", callback_data: `gem_approve:${contentId}` },
      { text: "Reject", callback_data: `gem_reject:${contentId}` },
    ],
  ];

  return sendMessage(text, keyboard);
}
