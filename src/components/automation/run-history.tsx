"use client";

import { Badge } from "@/components/ui/badge";
import type { AutomationRun } from "@/types";

const AGENT_NAMES: Record<string, string> = {
  "job-matcher": "Job Matcher",
  content: "Content",
  github: "GitHub",
  linkedin: "LinkedIn",
  resume: "Resume",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

export function RunHistory({ runs }: { runs: AutomationRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground/60">
        No automation runs yet. Trigger an agent manually or wait for the schedule.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Agent</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Findings</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Started</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Notified</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} className="border-b border-border last:border-0 hover:bg-card">
              <td className="px-4 py-3 text-foreground">
                {AGENT_NAMES[run.agent_id] || run.agent_id}
              </td>
              <td className="px-4 py-3">
                <Badge
                  variant="outline"
                  className={
                    run.status === "success"
                      ? "text-emerald-400"
                      : run.status === "error"
                        ? "text-red-400"
                        : "text-blue-400"
                  }
                >
                  {run.status}
                </Badge>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{run.findings_count}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(run.started_at)}</td>
              <td className="px-4 py-3">
                {run.notified ? (
                  <span className="text-emerald-400 text-xs">Sent</span>
                ) : (
                  <span className="text-muted-foreground/60 text-xs">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
