/**
 * Represent Me — Background Worker v3
 *
 * Runs alongside `next dev` via concurrently.
 * Handles: AI agent initialization, event bus, cron scheduling, Telegram polling.
 *
 * Usage: tsx watch worker.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  console.log("============================================");
  console.log("  Represent Me — AI Agent Worker v3");
  console.log("============================================");
  console.log("");

  const hasAI = !!process.env.ANTHROPIC_API_KEY;
  const hasTelegram = !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID;

  console.log(`  Claude API:  ${hasAI ? "✅ configured" : "❌ not configured (static mode)"}`);
  console.log(`  Telegram:    ${hasTelegram ? "✅ configured" : "❌ not configured"}`);
  console.log(`  GitHub:      ${process.env.GITHUB_TOKEN ? "✅ configured" : "⚠️  using anonymous (60 req/hr)"}`);
  console.log("");

  // Initialize database
  const { getDb } = await import("./src/lib/db");
  getDb();
  console.log("[Worker] Database initialized");

  // Start scheduler (initializes event bus + AI agents internally)
  const { startScheduler } = await import("./src/lib/scheduler");
  startScheduler();

  console.log("");
  console.log("[Worker] All systems running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("[Worker] Fatal error:", err);
  process.exit(1);
});
