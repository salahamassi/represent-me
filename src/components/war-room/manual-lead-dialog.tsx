"use client";

/**
 * Manual Lead dialog — Salah pastes a JD (and optionally URL / company /
 * job title / contact name) and fires the Obeida Workflow consultation
 * chain.
 *
 * On submit we POST /api/manual-lead and the server publishes
 * `manual-lead:submitted` on the agent bus. Saqr → Qalam → Amin then
 * fan out asynchronously; the UI just dismisses the dialog and lets the
 * Chatter Feed + Sifr hero dock show progress.
 *
 * Self-contained modal — fixed positioning, no portal lib.
 */

import { useEffect, useRef, useState } from "react";
import { X, Send } from "lucide-react";
import { cn } from "@/lib/utils";

export function ManualLeadDialog({
  open,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  /** Fires once the POST succeeds so the hero can start watching for
   *  chain events for this specific leadId. */
  onSubmitted?: (leadId: string) => void;
}) {
  const [jdText, setJdText] = useState("");
  const [url, setUrl] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [contactName, setContactName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Escape to close, autofocus textarea on open. Matches the chat drawer.
  useEffect(() => {
    if (!open) return;
    setTimeout(() => textareaRef.current?.focus(), 80);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, pending]);

  async function submit() {
    const trimmed = jdText.trim();
    if (trimmed.length < 40) {
      setError("Paste the full JD (min 40 characters).");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/manual-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jdText: trimmed,
          url: url.trim() || undefined,
          company: company.trim() || undefined,
          jobTitle: jobTitle.trim() || undefined,
          contactName: contactName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      // Reset and close. The Chatter Feed will light up with Saqr +
      // Qalam + Amin's chain events over the next ~20s.
      setJdText("");
      setUrl("");
      setCompany("");
      setJobTitle("");
      setContactName("");
      onSubmitted?.(data.leadId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div
        aria-hidden={!open}
        onClick={() => !pending && onClose()}
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      <div
        role="dialog"
        aria-label="Submit manual lead"
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-xl -translate-x-1/2 -translate-y-1/2",
          "rounded-2xl border border-violet-500/40 bg-background/95 p-5 shadow-2xl backdrop-blur-xl",
          "transition-all duration-200",
          open ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
        )}
      >
        <header className="mb-4 flex items-start justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300">
              Manual Lead
            </div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
              Paste a JD, kick off the consultation.
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              صقر analyzes · قلم drafts · أمين prepares the kit. You do nothing.
            </p>
          </div>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3">
          <textarea
            ref={textareaRef}
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            rows={8}
            placeholder="Paste the full job description here…"
            disabled={pending}
            className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-violet-500/40 disabled:opacity-60"
          />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <LabeledInput
              label="Job title"
              value={jobTitle}
              onChange={setJobTitle}
              placeholder="Senior iOS Engineer"
              disabled={pending}
            />
            <LabeledInput
              label="Company"
              value={company}
              onChange={setCompany}
              placeholder="Acme Inc."
              disabled={pending}
            />
            <LabeledInput
              label="URL (optional)"
              value={url}
              onChange={setUrl}
              placeholder="https://…"
              disabled={pending}
            />
            <LabeledInput
              label="Referrer / contact"
              value={contactName}
              onChange={setContactName}
              placeholder="Obeida"
              disabled={pending}
              hint="If it's Obeida, Qalam will lean into the teacher→student history."
            />
          </div>

          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
              {error}
            </div>
          )}
        </div>

        <footer className="mt-5 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground/70">
            Esc to close · ⌘+Enter to fire
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={pending || jdText.trim().length < 40}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg transition-opacity",
              (pending || jdText.trim().length < 40) && "opacity-40"
            )}
          >
            <Send className="h-3.5 w-3.5" />
            {pending ? "Firing chain…" : "Fire the team"}
          </button>
        </footer>
      </div>
    </>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-[12px] outline-none placeholder:text-muted-foreground/50 focus:border-violet-500/40 disabled:opacity-60"
      />
      {hint && <span className="text-[10px] text-muted-foreground/60">{hint}</span>}
    </label>
  );
}
