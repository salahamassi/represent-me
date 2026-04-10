"use client";

import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PRIORITY_CONFIG, EFFORT_CONFIG } from "@/lib/constants";
import type { ActionItem as ActionItemType, AgentId } from "@/types";
import { useAgentStore } from "@/store/agent-store";

export function ActionItem({
  item,
  showAgent = false,
}: {
  item: ActionItemType;
  showAgent?: boolean;
}) {
  const toggleActionItem = useAgentStore((s) => s.toggleActionItem);
  const priorityConfig = PRIORITY_CONFIG[item.priority];
  const effortConfig = EFFORT_CONFIG[item.effort];

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border p-3 transition-colors",
        item.completed ? "bg-muted/50 opacity-60" : "bg-card"
      )}
    >
      <input
        type="checkbox"
        checked={item.completed}
        onChange={() => toggleActionItem(item.agentId as AgentId, item.id)}
        className="mt-1 h-4 w-4 rounded border-zinc-600 bg-muted accent-emerald-500"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "text-sm font-medium",
              item.completed ? "text-muted-foreground line-through" : "text-foreground"
            )}
          >
            {item.title}
          </span>
          <Badge variant="outline" className={cn("text-[10px]", priorityConfig.color)}>
            {priorityConfig.label}
          </Badge>
          <Badge variant="outline" className={cn("text-[10px]", effortConfig.color)}>
            {effortConfig.label}
          </Badge>
          {showAgent && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {item.agentId}
            </Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
        {item.link && (
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
          >
            <ExternalLink className="h-3 w-3" /> Open
          </a>
        )}
      </div>
    </div>
  );
}
