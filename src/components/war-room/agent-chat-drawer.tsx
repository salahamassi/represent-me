"use client";

/**
 * Slide-over chat drawer — direct message line to a single persona.
 *
 * Lightweight, self-contained: uses fixed positioning + a translate-x
 * transition for the panel animation rather than pulling in a portal
 * library. State is in-session only (resets on reload) — we decided in
 * the plan that chat persistence is a future enhancement.
 *
 * The POST goes to /api/agents/chat which calls Claude Haiku with a
 * persona-specific system prompt. See that route for the voice rules.
 */

import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { PERSONA, type AgentRole } from "@/agents/base/agent-aliases";
import { AgentAvatar } from "./agent-avatar";
import { cn } from "@/lib/utils";

type ChatRole = Extract<AgentRole, "Saqr" | "Qalam" | "Amin">;

interface Msg {
  role: "user" | "assistant";
  content: string;
}

/** Opening line each persona greets Salah with, in-character. These are
 *  rendered as the first assistant message but never sent to the API
 *  (they'd only bloat the context — Claude already knows who it is). */
const GREETING: Record<ChatRole, string> = {
  Saqr: "What do you need me to go find? Jobs, issues, something else — point me at it.",
  Qalam: "Hey Salah. Got a piece you want to write, or should I pitch you a couple of angles?",
  Amin: "Salah — what would you like me to review? A resume, a posting, an ATS gap?",
};

export function AgentChatDrawer({
  role,
  onClose,
}: {
  role: ChatRole | null;
  onClose: () => void;
}) {
  // Per-session memory keyed by role. When the user switches between
  // agents without closing the page, each conversation is preserved.
  const [history, setHistory] = useState<Record<ChatRole, Msg[]>>({
    Saqr: [],
    Qalam: [],
    Amin: [],
  });
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const isOpen = role !== null;
  const messages = role ? history[role] : [];

  // Autofocus the input when the drawer opens, and keep the scroll pinned
  // to the bottom as messages land.
  useEffect(() => {
    if (isOpen) {
      // Defer so the focus lands after the transition starts — prevents
      // the page from visibly jerking to follow focus on open.
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, role]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending]);

  // Escape to close — chat drawers should always be escape-dismissable.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  async function send() {
    if (!role) return;
    const trimmed = input.trim();
    if (!trimmed || pending) return;

    const next: Msg[] = [...history[role], { role: "user", content: trimmed }];
    setHistory((prev) => ({ ...prev, [role]: next }));
    setInput("");
    setPending(true);
    setError(null);

    try {
      const res = await fetch("/api/agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, messages: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setHistory((prev) => ({
        ...prev,
        [role]: [...next, { role: "assistant", content: data.reply }],
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter inserts a newline. Standard chat UX.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const persona = role ? PERSONA[role] : null;
  const greeting = role ? GREETING[role] : null;

  return (
    <>
      {/* Backdrop — fades in with the panel, click to close. */}
      <div
        aria-hidden={!isOpen}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      {/* Panel — slides in from the right. Size tuned for comfortable
          chat reading on laptop widths without hogging the page. */}
      <aside
        role="dialog"
        aria-label={persona ? `Chat with ${persona.name}` : "Chat"}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-background/95 backdrop-blur-xl shadow-2xl transition-transform duration-300",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {role && persona && (
          <>
            {/* Header */}
            <header
              className={cn(
                "flex items-center gap-3 border-b px-4 py-3",
                persona.border
              )}
            >
              <AgentAvatar role={role} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn("text-base font-bold leading-none", persona.text)}
                    lang="ar"
                    dir="rtl"
                  >
                    {persona.name}
                  </span>
                  <span className={cn("text-xs font-semibold tracking-wide", persona.text)}>
                    {persona.latin}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {persona.role} · Direct line
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close chat"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {/* Transcript */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
              {/* Greeting is always the first visible message. Not
                  stored in history so it's not sent back to the API. */}
              <div className="mb-3 flex items-end gap-2">
                <AgentAvatar role={role} size="sm" />
                <div
                  className={cn(
                    "max-w-[82%] rounded-2xl rounded-bl-sm border px-3.5 py-2 text-[13px] leading-relaxed",
                    persona.bubble,
                    persona.border
                  )}
                >
                  {greeting}
                </div>
              </div>

              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "mb-3 flex items-end gap-2",
                    m.role === "user" && "flex-row-reverse"
                  )}
                >
                  {m.role === "assistant" && <AgentAvatar role={role} size="sm" />}
                  <div
                    className={cn(
                      "max-w-[82%] whitespace-pre-wrap rounded-2xl border px-3.5 py-2 text-[13px] leading-relaxed",
                      m.role === "assistant"
                        ? `${persona.bubble} ${persona.border} rounded-bl-sm`
                        : "bg-foreground/10 border-border rounded-br-sm text-foreground"
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {pending && (
                <div className="mb-3 flex items-end gap-2">
                  <AgentAvatar role={role} size="sm" />
                  <div
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-2xl rounded-bl-sm border px-4 py-2.5",
                      persona.bubble,
                      persona.border,
                      persona.text
                    )}
                  >
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
                  {error}
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-border px-3 py-3">
              <div
                className={cn(
                  "flex items-end gap-2 rounded-xl border bg-background/60 p-2",
                  persona.border
                )}
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  placeholder={`Message ${persona.latin}…`}
                  disabled={pending}
                  className="min-h-[28px] max-h-28 flex-1 resize-none bg-transparent px-2 py-1 text-[13px] outline-none placeholder:text-muted-foreground/60 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={pending || !input.trim()}
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white transition-opacity",
                    persona.solid,
                    (pending || !input.trim()) && "opacity-40"
                  )}
                  aria-label="Send"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-1.5 px-1 text-[10px] text-muted-foreground/60">
                Enter to send · Shift+Enter for newline · Haiku-backed
              </p>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
