"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CreditCard, Key, Clock, X } from "lucide-react";

interface AgentError {
  id: number;
  agentId: string;
  title: string;
  type: "credit" | "rate_limit" | "auth" | "overloaded" | "network" | "unknown";
  createdAt: string;
}

const ERROR_CONFIG: Record<AgentError["type"], { icon: typeof CreditCard; label: string; color: string; cta?: string; ctaUrl?: string }> = {
  credit: {
    icon: CreditCard,
    label: "Out of Claude credits",
    color: "border-red-500/30 bg-red-500/10 text-red-300",
    cta: "Add credits",
    ctaUrl: "https://console.anthropic.com/settings/billing",
  },
  auth: {
    icon: Key,
    label: "Claude API key invalid",
    color: "border-red-500/30 bg-red-500/10 text-red-300",
    cta: "Check key",
    ctaUrl: "https://console.anthropic.com/settings/keys",
  },
  rate_limit: {
    icon: Clock,
    label: "Rate limited by Claude",
    color: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  overloaded: {
    icon: Clock,
    label: "Claude API overloaded",
    color: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  network: {
    icon: AlertTriangle,
    label: "Network error reaching Claude",
    color: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  unknown: {
    icon: AlertTriangle,
    label: "Agent run failed",
    color: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
  },
};

function timeAgo(iso: string): string {
  const d = new Date(iso + "Z").getTime();
  const diffMin = Math.floor((Date.now() - d) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

const DISMISSED_STORAGE_KEY = "agent-error-dismissed";
const DISMISSED_CAP = 50;

function readDismissedIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DISMISSED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

function writeDismissedIds(ids: number[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(ids.slice(-DISMISSED_CAP)));
  } catch {
    // Ignore quota / privacy-mode errors — dismissal just won't persist
  }
}

export function AgentStatusBanner() {
  const [error, setError] = useState<AgentError | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(() => new Set());

  // Hydrate dismissed IDs from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    setDismissedIds(new Set(readDismissedIds()));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch("/api/agents/status");
        const data = await res.json();
        if (!cancelled) setError(data.error);
      } catch {
        // Silently fail — banner just won't show
      }
    }
    check();
    const interval = setInterval(check, 30_000); // poll every 30s
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!error || dismissedIds.has(error.id)) return null;

  const dismiss = () => {
    const next = new Set(dismissedIds);
    next.add(error.id);
    setDismissedIds(next);
    writeDismissedIds(Array.from(next));
  };

  const config = ERROR_CONFIG[error.type] || ERROR_CONFIG.unknown;
  const Icon = config.icon;

  return (
    <div className={`mb-4 flex items-start gap-3 rounded-lg border px-4 py-3 ${config.color}`}>
      <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{config.label}</div>
        <div className="text-xs opacity-80 mt-0.5">
          {error.agentId} agent · {timeAgo(error.createdAt)}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {config.cta && config.ctaUrl && (
          <a
            href={config.ctaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 transition-colors"
          >
            {config.cta} →
          </a>
        )}
        <button
          onClick={dismiss}
          className="opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
