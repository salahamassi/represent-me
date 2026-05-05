/**
 * GET /api/agent-bus/stream  — Server-Sent Events feed of every agent
 * event in the system, tailored for the React "War Room" UI.
 *
 * Why SSE (not WebSocket): we only need server→client, the payload is
 * already JSON, and Next.js serves SSE over plain HTTP/2 without a
 * separate upgrade handshake. It also survives across the dev-proxy,
 * which is important while we iterate.
 *
 * Why tail `agent_activity_log` (not subscribe to AgentBus in-memory):
 * the Next.js dev server and the worker process each own their own
 * AgentBus singleton — events raised in the worker wouldn't reach a
 * subscriber registered in the Next process. Every publish() already
 * persists to agent_activity_log, so we tail that table and get
 * cross-process coverage for free.
 *
 * Frame shape:
 *   event: bootstrap     — once on connect, payload: { events: AgentBusFrame[] }
 *   event: event         — per new row, payload: AgentBusFrame
 *   event: heartbeat     — every 15 s to keep proxies from closing idle conns
 *
 *   AgentBusFrame = {
 *     id, agentId, role, eventType, title, detail, runId, createdAt
 *   }
 */

import { NextRequest } from "next/server";
import { getActivityLogSince, getActivityLog } from "@/lib/db";
import { toAlias } from "@/agents/base/agent-aliases";

// `edge` runtime doesn't support better-sqlite3 (native bindings); Node-only.
export const runtime = "nodejs";
// Keep the connection open — Next caches routes by default.
export const dynamic = "force-dynamic";

interface LogRow {
  id: number;
  agent_id: string;
  event_type: string;
  title: string;
  detail: string | null;
  run_id: number | null;
  created_at: string;
}

interface AgentBusFrame {
  id: number;
  agentId: string;
  role: string;
  eventType: string;
  title: string;
  detail: string | null;
  runId: number | null;
  createdAt: string;
}

function toFrame(row: LogRow): AgentBusFrame {
  return {
    id: row.id,
    agentId: row.agent_id,
    role: toAlias(row.agent_id),
    eventType: row.event_type,
    title: row.title,
    detail: row.detail,
    runId: row.run_id,
    createdAt: row.created_at,
  };
}

/**
 * Format a single SSE frame. SSE protocol is line-based:
 *   event: <name>\n
 *   data: <json>\n
 *   \n   (blank line terminates the frame)
 */
function formatSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  // The SSE spec and reverse proxies need us to stream; build a
  // ReadableStream that writes frames as agent events happen.
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let cursor = 0;
      let pollTimer: NodeJS.Timeout | null = null;
      let heartbeatTimer: NodeJS.Timeout | null = null;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(formatSSE(event, data)));
        } catch {
          // Controller throws if the client has already dropped — mark
          // closed so timers tear down on the next tick.
          closed = true;
        }
      };

      const cleanup = () => {
        closed = true;
        if (pollTimer) clearInterval(pollTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // 1) Bootstrap: replay the last 50 events so the UI can paint
      // immediately without waiting for the next bus publish.
      const recent = (getActivityLog(50) as LogRow[])
        .slice()
        .reverse(); // oldest → newest for stable timeline
      cursor = recent.length > 0 ? Math.max(...recent.map((r) => r.id)) : 0;

      send("bootstrap", {
        events: recent.map(toFrame),
        cursor,
        serverTime: new Date().toISOString(),
      });

      // 2) Poll loop. 1 s feels live without hammering SQLite (each
      // read is indexed on id). `better-sqlite3` is sync so there's
      // no async overhead per tick.
      pollTimer = setInterval(() => {
        if (closed) return;
        try {
          const rows = getActivityLogSince(cursor);
          if (rows.length > 0) {
            for (const row of rows) {
              send("event", toFrame(row as LogRow));
            }
            cursor = rows[rows.length - 1].id;
          }
        } catch (err) {
          console.error("[agent-bus/stream] poll error:", err);
        }
      }, 1000);

      // 3) Heartbeat — keeps Next.js / Vercel proxies from dropping
      // an "idle" connection when there's no chatter. Also lets the
      // client detect a dead socket within ~15 s.
      heartbeatTimer = setInterval(() => {
        if (closed) return;
        send("heartbeat", { at: new Date().toISOString() });
      }, 15_000);

      // 4) Tear down when the client disconnects. AbortSignal from
      // Next gives us a clean hook for both browser close and HMR.
      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      // Disable nginx-style buffering so proxies flush each frame.
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
