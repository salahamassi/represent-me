/**
 * Agent Event Bus — Typed pub/sub + request/response for inter-agent communication.
 * Runs in-memory within the single worker.ts process.
 */

export interface AgentEvent {
  type: string;
  source: string;
  payload: unknown;
  timestamp: Date;
}

type EventHandler = (event: AgentEvent) => void | Promise<void>;
type RequestHandler = (payload: unknown) => Promise<unknown>;

export class AgentBus {
  private listeners = new Map<string, Set<EventHandler>>();
  private responders = new Map<string, RequestHandler>();
  private eventLog: AgentEvent[] = [];

  /**
   * Subscribe to events of a given type.
   * Returns an unsubscribe function.
   */
  subscribe(eventType: string, handler: EventHandler): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(handler);

    return () => {
      this.listeners.get(eventType)?.delete(handler);
    };
  }

  /**
   * Publish an event to all subscribers.
   */
  async publish(type: string, source: string, payload: unknown): Promise<void> {
    const event: AgentEvent = {
      type,
      source,
      payload,
      timestamp: new Date(),
    };

    this.eventLog.push(event);

    // Keep only last 200 events
    if (this.eventLog.length > 200) {
      this.eventLog = this.eventLog.slice(-100);
    }

    const handlers = this.listeners.get(type);
    if (!handlers || handlers.size === 0) {
      console.log(`[Bus] No listeners for "${type}" from ${source}`);
      return;
    }

    console.log(`[Bus] "${type}" from ${source} → ${handlers.size} listener(s)`);

    // Log to activity log
    try {
      const { logActivity } = await import("@/lib/db");
      logActivity({
        agentId: source,
        eventType: "bus_event",
        title: `Event: ${type}`,
        detail: typeof payload === "object" ? JSON.stringify(payload).slice(0, 500) : String(payload),
      });
    } catch { /* ignore if DB not ready */ }

    const promises = Array.from(handlers).map(async (handler) => {
      try {
        await handler(event);
      } catch (err) {
        console.error(`[Bus] Handler error for "${type}":`, err);
      }
    });

    await Promise.all(promises);
  }

  /**
   * Register a responder for request/response pattern.
   * Only one responder per event type.
   */
  respond(eventType: string, handler: RequestHandler): void {
    if (this.responders.has(eventType)) {
      console.warn(`[Bus] Overwriting responder for "${eventType}"`);
    }
    this.responders.set(eventType, handler);
  }

  /**
   * Send a request and wait for a response.
   * Used for synchronous-style inter-agent calls.
   */
  async request<T>(eventType: string, payload: unknown, timeoutMs = 60000): Promise<T> {
    const handler = this.responders.get(eventType);
    if (!handler) {
      throw new Error(`[Bus] No responder registered for "${eventType}"`);
    }

    console.log(`[Bus] Request: "${eventType}"`);

    const result = await Promise.race([
      handler(payload),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`[Bus] Request "${eventType}" timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);

    return result as T;
  }

  /**
   * Get recent event log for debugging/dashboard.
   */
  getRecentEvents(limit = 50): AgentEvent[] {
    return this.eventLog.slice(-limit);
  }
}

// Singleton instance
let _bus: AgentBus | null = null;

export function getAgentBus(): AgentBus {
  if (!_bus) {
    _bus = new AgentBus();
  }
  return _bus;
}
