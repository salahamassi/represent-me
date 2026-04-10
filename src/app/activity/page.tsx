"use client";

import { useEffect } from "react";
import { useActivityStore } from "@/store/activity-store";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ActivityLogEntry } from "@/types";

const AGENT_FILTERS = [
  { id: "", label: "All Agents" },
  { id: "github", label: "GitHub" },
  { id: "content", label: "Content" },
  { id: "job-matcher", label: "Job Matcher" },
  { id: "resume", label: "Resume" },
  { id: "linkedin", label: "LinkedIn" },
];

export default function ActivityPage() {
  const activities = useActivityStore((s) => s.activities);
  const costs = useActivityStore((s) => s.costs);
  const loading = useActivityStore((s) => s.loading);
  const filter = useActivityStore((s) => s.filter);
  const fetchActivities = useActivityStore((s) => s.fetchActivities);
  const setFilter = useActivityStore((s) => s.setFilter);

  useEffect(() => {
    fetchActivities(filter.agentId);
    const interval = setInterval(() => fetchActivities(filter.agentId), 15000);
    return () => clearInterval(interval);
  }, [fetchActivities, filter.agentId]);

  // Filter by event type client-side
  const filtered = filter.eventType
    ? activities.filter((a: ActivityLogEntry) => a.event_type === filter.eventType)
    : activities;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Activity Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real-time timeline of all agent operations
        </p>
      </div>

      {/* Cost Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Today</p>
            <p className="mt-1 text-lg font-semibold text-emerald-400">
              ${costs.today.toFixed(4)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">This Week</p>
            <p className="mt-1 text-lg font-semibold text-emerald-400">
              ${costs.week.toFixed(4)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">This Month</p>
            <p className="mt-1 text-lg font-semibold text-emerald-400">
              ${costs.month.toFixed(4)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {AGENT_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter({ ...filter, agentId: f.id || undefined })}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              (filter.agentId || "") === f.id
                ? "bg-emerald-600 text-white"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="mx-2 text-muted-foreground/40">|</span>
        {["fetch", "analyze", "generate", "notify", "error", "bus_event"].map((et) => (
          <button
            key={et}
            onClick={() =>
              setFilter({ ...filter, eventType: filter.eventType === et ? undefined : et })
            }
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter.eventType === et
                ? "bg-purple-600 text-white"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {et}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          {loading && filtered.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground/60">
              Loading activities...
            </div>
          ) : (
            <ActivityFeed activities={filtered as ActivityLogEntry[]} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
