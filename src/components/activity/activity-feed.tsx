"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ActivityLogEntry } from "@/types";

const EVENT_CONFIG: Record<string, { emoji: string; color: string; label: string }> = {
  fetch: { emoji: "🔍", color: "text-blue-400", label: "Fetch" },
  analyze: { emoji: "🧠", color: "text-purple-400", label: "AI" },
  generate: { emoji: "✍️", color: "text-emerald-400", label: "Generate" },
  notify: { emoji: "📬", color: "text-yellow-400", label: "Notify" },
  error: { emoji: "❌", color: "text-red-400", label: "Error" },
  bus_event: { emoji: "🔗", color: "text-cyan-400", label: "Event" },
};

const AGENT_NAMES: Record<string, string> = {
  github: "GitHub",
  content: "Content",
  "job-matcher": "Job Matcher",
  resume: "Resume",
  linkedin: "LinkedIn",
  telegram: "Telegram",
};

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function ActivityFeed({
  activities,
  compact = false,
  maxItems,
}: {
  activities: ActivityLogEntry[];
  compact?: boolean;
  maxItems?: number;
}) {
  const items = maxItems ? activities.slice(0, maxItems) : activities;

  if (items.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground/60">
        No activity yet. Run an agent to see the timeline.
      </div>
    );
  }

  // Group by date
  const grouped: Record<string, ActivityLogEntry[]> = {};
  for (const item of items) {
    const date = formatDate(item.created_at);
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(item);
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([date, entries]) => (
        <div key={date}>
          {!compact && (
            <div className="mb-2 text-xs font-medium text-muted-foreground">{date}</div>
          )}
          <div className="space-y-1">
            {entries.map((entry) => {
              const config = EVENT_CONFIG[entry.event_type] || EVENT_CONFIG.fetch;
              return (
                <div
                  key={entry.id}
                  className={cn(
                    "flex items-start gap-3 rounded-md px-3 py-2 transition-colors hover:bg-card",
                    compact ? "py-1.5" : "py-2"
                  )}
                >
                  {/* Timeline dot */}
                  <div className="mt-1 flex flex-col items-center">
                    <span className={cn("text-sm", config.color)}>{config.emoji}</span>
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-xs font-medium", config.color)}>
                        {AGENT_NAMES[entry.agent_id] || entry.agent_id}
                      </span>
                      <span className="text-xs text-muted-foreground/60">
                        {formatTime(entry.created_at)}
                      </span>
                    </div>
                    <p className={cn("text-foreground", compact ? "text-xs" : "text-sm")}>
                      {entry.title}
                    </p>
                  </div>

                  {/* Cost badge */}
                  {entry.cost_usd && entry.cost_usd > 0 && (
                    <Badge variant="outline" className="shrink-0 text-xs text-emerald-400">
                      ${entry.cost_usd.toFixed(4)}
                    </Badge>
                  )}

                  {/* Tokens badge */}
                  {entry.tokens_used && entry.tokens_used > 0 && !compact && (
                    <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
                      {entry.tokens_used.toLocaleString()} tok
                    </Badge>
                  )}

                  {/* Duration */}
                  {entry.duration_ms && entry.duration_ms > 0 && !compact && (
                    <span className="shrink-0 text-xs text-muted-foreground/60">
                      {(entry.duration_ms / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
