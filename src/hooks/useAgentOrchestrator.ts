"use client";

/**
 * useAgentOrchestrator — React hook that subscribes to the server's
 * /api/agent-bus/stream SSE feed and exposes a live "War Room" view of
 * every agent in the system.
 *
 * Returns:
 *   - eventLog        : newest-first AgentBusFrame[] (capped at 100)
 *   - systemState     : { [role]: { status, lastSeen, lastEvent } }
 *                       derived from the event stream. status is one of
 *                       "idle" | "running" | "done" | "error".
 *   - isConnected     : true when the SSE socket is open
 *   - lastError       : any SSE/parse error message for debugging
 *
 * The hook reconnects automatically with a small backoff if the stream
 * drops. Heartbeat frames every 15 s let us mark the connection "alive"
 * even in a quiet period with no agent chatter.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  toAlias,
  type AgentRole,
} from "@/agents/base/agent-aliases";

/** Shape of a single bus event as delivered over SSE. Mirrors the server. */
export interface AgentBusFrame {
  id: number;
  agentId: string;
  role: AgentRole;
  eventType: string;
  title: string;
  detail: string | null;
  runId: number | null;
  createdAt: string; // ISO
}

export type AgentStatus = "idle" | "running" | "done" | "error";

export interface AgentRuntimeState {
  status: AgentStatus;
  /** Most recent event timestamp for this role (ISO). */
  lastSeen: string | null;
  /** Most recent event's title — one-line UI peek. */
  lastEvent: string | null;
}

/**
 * System state is keyed by persona so the UI can render a fixed set of
 * cards (Saqr / Qalam / Amin) without caring about the underlying
 * agent id jostling. Sifr is synthesised client-side — never populated
 * by events — but we keep a slot so downstream consumers can read it
 * uniformly.
 */
export type SystemState = Record<AgentRole, AgentRuntimeState>;

const INITIAL_STATE: SystemState = {
  Saqr: { status: "idle", lastSeen: null, lastEvent: null },
  Qalam: { status: "idle", lastSeen: null, lastEvent: null },
  Amin: { status: "idle", lastSeen: null, lastEvent: null },
  Sifr: { status: "idle", lastSeen: null, lastEvent: null },
  System: { status: "idle", lastSeen: null, lastEvent: null },
};

const EVENT_LOG_CAP = 100;
const RECONNECT_DELAY_MS = 2_000;

/**
 * Map a raw event_type string from the bus to a runtime status
 * transition. The existing agents log start/end events as:
 *   "run_start"    | "run_end"    — from logRunStart / logRunEnd
 *   "bus_event"    — every bus.publish() call
 * We treat run_start as "running", run_end as "done", any "*:error"
 * event_type as "error", and let quieter events just refresh lastSeen.
 */
function nextStatus(
  current: AgentStatus,
  eventType: string
): AgentStatus {
  const t = eventType.toLowerCase();
  if (t.includes("error") || t.includes("failed")) return "error";
  if (t === "run_start" || t.endsWith(":start")) return "running";
  if (t === "run_end" || t.endsWith(":complete") || t.endsWith(":done"))
    return "done";
  // No transition — keep current state, the UI will just update "lastSeen".
  return current;
}

export function useAgentOrchestrator() {
  const [eventLog, setEventLog] = useState<AgentBusFrame[]>([]);
  const [systemState, setSystemState] = useState<SystemState>(INITIAL_STATE);
  const [isConnected, setIsConnected] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // EventSource lives outside React state so we can clean it up without
  // re-running the effect on every render.
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const seenIdsRef = useRef<Set<number>>(new Set());

  /**
   * Fold a single frame into component state. Exposed as a callback so
   * the same logic handles "bootstrap" (N frames) and "event" (1 frame)
   * without duplicating code.
   */
  const applyFrame = useCallback((frame: AgentBusFrame) => {
    // De-dupe by id — SSE reconnect may replay the tail and we don't want
    // duplicate log rows on the UI.
    if (seenIdsRef.current.has(frame.id)) return;
    seenIdsRef.current.add(frame.id);

    setEventLog((prev) => {
      // Newest-first, capped — the hottest events sit at the top.
      const next = [frame, ...prev];
      return next.length > EVENT_LOG_CAP ? next.slice(0, EVENT_LOG_CAP) : next;
    });

    setSystemState((prev) => {
      const role = frame.role ?? toAlias(frame.agentId);
      const current = prev[role] ?? INITIAL_STATE.System;
      const status = nextStatus(current.status, frame.eventType);
      return {
        ...prev,
        [role]: {
          status,
          lastSeen: frame.createdAt,
          lastEvent: frame.title,
        },
      };
    });
  }, []);

  const connect = useCallback(() => {
    // Guard against double-open (StrictMode in dev fires effects twice).
    if (esRef.current) return;

    let es: EventSource;
    try {
      es = new EventSource("/api/agent-bus/stream");
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
      return;
    }
    esRef.current = es;

    es.addEventListener("open", () => {
      setIsConnected(true);
      setLastError(null);
    });

    es.addEventListener("bootstrap", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as {
          events: AgentBusFrame[];
        };
        // Apply in order so "running → done" transitions land correctly.
        for (const frame of data.events) applyFrame(frame);
      } catch (err) {
        setLastError(`bootstrap parse: ${err}`);
      }
    });

    es.addEventListener("event", (e) => {
      try {
        const frame = JSON.parse((e as MessageEvent).data) as AgentBusFrame;
        applyFrame(frame);
      } catch (err) {
        setLastError(`event parse: ${err}`);
      }
    });

    es.addEventListener("heartbeat", () => {
      // No-op: the mere arrival of the frame proves the socket's alive.
      // We could surface this as "lastHeartbeat" later if we need it.
    });

    es.addEventListener("error", () => {
      // EventSource auto-retries on 5xx, but if the Next dev server
      // restarted the `readyState` stays CLOSED and we have to rebuild.
      setIsConnected(false);
      if (es.readyState === EventSource.CLOSED) {
        es.close();
        esRef.current = null;
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
        }
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    });
  }, [applyFrame]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      setIsConnected(false);
    };
  }, [connect]);

  return {
    eventLog,
    systemState,
    isConnected,
    lastError,
  };
}
