"use client";

import type { PresenceScore } from "@/types";
import { getScoreStroke } from "@/lib/constants";

const CATEGORIES: { key: keyof Omit<PresenceScore, "overall">; label: string }[] = [
  { key: "github", label: "GitHub" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "content", label: "Content" },
  { key: "consistency", label: "Consistency" },
  { key: "jobReadiness", label: "Job Readiness" },
];

export function ScoreBreakdown({ scores }: { scores: PresenceScore }) {
  return (
    <div className="space-y-3">
      {CATEGORIES.map(({ key, label }) => {
        const score = scores[key];
        const color = getScoreStroke(score);
        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium" style={{ color }}>{score}</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${score}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
