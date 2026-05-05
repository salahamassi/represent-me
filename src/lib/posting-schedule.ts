/**
 * LinkedIn "best time to post" windows for Salah's audience.
 *
 * v3 update — Salah is targeting UK / EU recruiters (relocation in
 * progress). Audience pattern is Mon–Fri 9 AM – 6 PM local. We keep
 * the AST shift in place because Salah is currently in Cairo and the
 * timestamps Zernio sees should align to where Salah is when he
 * publishes; once he relocates we'll re-anchor the offset.
 *
 * Posting-window contract:
 *   - Inside the window  → publish IMMEDIATELY (catches the workday's
 *                          engagement curve).
 *   - Outside the window → AUTO-SCHEDULE for the next 10:30 AM Mon–Fri
 *                          slot (Yusuf's "the post will go up Monday
 *                          morning" behaviour).
 *
 * Saudi Arabia does NOT observe DST, so a fixed UTC offset is safe.
 */

const AST_OFFSET_MS = 3 * 60 * 60 * 1000;
// getUTCDay convention: Sun=0, Mon=1, …, Sat=6.
// Western Mon–Fri working week — Saturday/Sunday are weekend.
const GOOD_DAYS = new Set([1, 2, 3, 4, 5]);
const WINDOW_START_MIN = 9 * 60;       // 09:00 AST
const WINDOW_END_MIN = 18 * 60;        // 18:00 AST (6:00 PM)
const TARGET_HOUR = 10;
const TARGET_MIN = 30;

/**
 * Shift a real UTC Date into a Date whose UTC methods return AST wall-clock
 * components. Never treat the returned Date as a real moment — it's only a
 * container so `getUTCHours()` / `getUTCDay()` read AST values.
 */
function toAst(d: Date): Date {
  return new Date(d.getTime() + AST_OFFSET_MS);
}

function fromAst(astShiftedDate: Date): Date {
  return new Date(astShiftedDate.getTime() - AST_OFFSET_MS);
}

export function isInPostingWindow(now: Date = new Date()): boolean {
  const ast = toAst(now);
  if (!GOOD_DAYS.has(ast.getUTCDay())) return false;
  const minutes = ast.getUTCHours() * 60 + ast.getUTCMinutes();
  return minutes >= WINDOW_START_MIN && minutes <= WINDOW_END_MIN;
}

/**
 * Next Mon–Fri at 10:30 AM AST strictly after `now`. Used to populate
 * Zernio's `scheduledFor` when the user taps Publish outside the window.
 */
export function nextPostingSlot(now: Date = new Date()): Date {
  const ast = toAst(now);
  for (let offset = 0; offset < 8; offset++) {
    const candidate = new Date(ast);
    candidate.setUTCDate(ast.getUTCDate() + offset);
    candidate.setUTCHours(TARGET_HOUR, TARGET_MIN, 0, 0);
    if (!GOOD_DAYS.has(candidate.getUTCDay())) continue;
    const utc = fromAst(candidate);
    if (utc.getTime() > now.getTime()) return utc;
  }
  // Unreachable in practice (any starting Date reaches a good day within 8).
  throw new Error("nextPostingSlot: no slot found within 8 days");
}

/** Zernio expects naive local time + a separate `timezone` field. */
export function formatAstLocal(utcDate: Date): string {
  const ast = toAst(utcDate);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${ast.getUTCFullYear()}-${pad(ast.getUTCMonth() + 1)}-${pad(ast.getUTCDate())}` +
    `T${pad(ast.getUTCHours())}:${pad(ast.getUTCMinutes())}:${pad(ast.getUTCSeconds())}`
  );
}

/** Human-readable slot label for Telegram replies and UI badges. */
export function formatSlotHuman(utcDate: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(utcDate) + " AST";
}

export const POSTING_TIMEZONE = "Asia/Riyadh";
