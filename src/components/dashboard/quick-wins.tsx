"use client";

import { useAgentStore } from "@/store/agent-store";
import { ActionItem } from "@/components/agents/action-item";
import { Zap } from "lucide-react";

export function QuickWins() {
  const getAllActionItems = useAgentStore((s) => s.getAllActionItems);
  const items = getAllActionItems();

  const quickWins = items
    .filter((item) => !item.completed)
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const effortOrder = { quick: 0, moderate: 1, significant: 2 };
      const aScore = priorityOrder[a.priority] * 3 + effortOrder[a.effort];
      const bScore = priorityOrder[b.priority] * 3 + effortOrder[b.effort];
      return aScore - bScore;
    })
    .slice(0, 5);

  if (quickWins.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground/60">
        Run agents to discover quick wins
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Zap className="h-4 w-4 text-amber-400" />
        Top Quick Wins
      </div>
      <div className="space-y-2">
        {quickWins.map((item) => (
          <ActionItem key={item.id} item={item} showAgent />
        ))}
      </div>
    </div>
  );
}
