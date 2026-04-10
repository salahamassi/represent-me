"use client";

import {
  Code,
  Globe,
  FileText,
  Target,
  PenTool,
  Play,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AgentState } from "@/types";
import { useAgentStore } from "@/store/agent-store";
import { formatDistanceToNow } from "date-fns";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Github: Code,
  Linkedin: Globe,
  FileText,
  Target,
  PenTool,
};

const STATUS_CONFIG = {
  idle: { label: "Idle", color: "text-muted-foreground", bg: "bg-zinc-500/10" },
  running: { label: "Running", color: "text-blue-400", bg: "bg-blue-500/10" },
  done: { label: "Done", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  error: { label: "Error", color: "text-red-400", bg: "bg-red-500/10" },
};

export function AgentCard({ agent }: { agent: AgentState }) {
  const runAgent = useAgentStore((s) => s.runAgent);
  const resetAgent = useAgentStore((s) => s.resetAgent);
  const Icon = ICON_MAP[agent.icon] || FileText;
  const statusConfig = STATUS_CONFIG[agent.status];

  const criticalCount = agent.findings.filter((f) => f.severity === "critical").length;
  const warningCount = agent.findings.filter((f) => f.severity === "warning").length;
  const actionCount = agent.actionItems.filter((a) => !a.completed).length;

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", statusConfig.bg)}>
              <Icon className={cn("h-5 w-5", statusConfig.color)} />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{agent.name}</h3>
              <p className="text-xs text-muted-foreground">{agent.description}</p>
            </div>
          </div>
          <Badge variant="outline" className={cn("text-xs", statusConfig.color)}>
            {agent.status === "running" && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />}
            {statusConfig.label}
          </Badge>
        </div>

        {agent.status === "done" && (
          <div className="mt-4 flex items-center gap-4 text-xs">
            {criticalCount > 0 && (
              <span className="flex items-center gap-1 text-red-400">
                <AlertCircle className="h-3 w-3" /> {criticalCount} critical
              </span>
            )}
            {warningCount > 0 && (
              <span className="flex items-center gap-1 text-amber-400">
                <AlertCircle className="h-3 w-3" /> {warningCount} warnings
              </span>
            )}
            {actionCount > 0 && (
              <span className="flex items-center gap-1 text-blue-400">
                <CheckCircle2 className="h-3 w-3" /> {actionCount} actions
              </span>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-muted-foreground/60">
            {agent.lastRunAt && (
              <>
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(agent.lastRunAt, { addSuffix: true })}
              </>
            )}
          </div>
          <div className="flex gap-2">
            {agent.status === "done" && (
              <button
                onClick={() => resetAgent(agent.id)}
                className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
            )}
            <button
              onClick={() => runAgent(agent.id)}
              disabled={agent.status === "running"}
              className={cn(
                "flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                agent.status === "running"
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-muted text-foreground hover:bg-accent"
              )}
            >
              <Play className="h-3 w-3" />
              {agent.status === "running" ? "Running..." : "Run"}
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
