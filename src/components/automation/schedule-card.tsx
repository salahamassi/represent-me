"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ScheduleConfig } from "@/types";
import { useAutomationStore } from "@/store/automation-store";
import { Play, Clock, Loader2 } from "lucide-react";

const AGENT_NAMES: Record<string, string> = {
  "job-matcher": "Job Matcher",
  content: "Content Agent",
  github: "GitHub Agent",
  linkedin: "LinkedIn Agent",
  resume: "Resume Agent",
};

const CRON_LABELS: Record<string, string> = {
  "0 */6 * * *": "Every 6 hours",
  "0 8 * * *": "Daily at 8:00 AM",
  "0 9 * * 1": "Weekly (Monday 9:00 AM)",
  "0 0 * * 0": "Weekly (Sunday midnight)",
};

function formatCron(expr: string): string {
  return CRON_LABELS[expr] || expr;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  return d.toLocaleString();
}

export function ScheduleCard({ config }: { config: ScheduleConfig }) {
  const toggleSchedule = useAutomationStore((s) => s.toggleSchedule);
  const triggerRun = useAutomationStore((s) => s.triggerRun);
  const runningAgent = useAutomationStore((s) => s.runningAgent);
  const isRunning = runningAgent === config.agent_id;

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-foreground">
              {AGENT_NAMES[config.agent_id] || config.agent_id}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">{formatCron(config.cron_expression)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                config.enabled ? "text-emerald-400" : "text-muted-foreground"
              )}
            >
              {config.enabled ? "Active" : "Paused"}
            </Badge>
            <button
              onClick={() => toggleSchedule(config.agent_id, !config.enabled)}
              className={cn(
                "relative h-5 w-9 rounded-full transition-colors",
                config.enabled ? "bg-emerald-600" : "bg-accent"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                  config.enabled ? "left-[18px]" : "left-0.5"
                )}
              />
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Last: {formatDate(config.last_run_at)}
          </span>
        </div>

        <div className="mt-3">
          <button
            onClick={() => triggerRun(config.agent_id)}
            disabled={isRunning}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              isRunning
                ? "cursor-not-allowed bg-muted text-muted-foreground"
                : "bg-muted text-foreground hover:bg-accent"
            )}
          >
            {isRunning ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Running...
              </>
            ) : (
              <>
                <Play className="h-3 w-3" /> Run Now
              </>
            )}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
