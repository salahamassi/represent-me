"use client";

import type { Finding } from "@/types";
import { FindingCard } from "./finding-card";

export function FindingsList({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground/60">
        Run the agent to see findings
      </div>
    );
  }

  const sorted = [...findings].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2, positive: 3 };
    return order[a.severity] - order[b.severity];
  });

  return (
    <div className="space-y-3">
      {sorted.map((finding) => (
        <FindingCard key={finding.id} finding={finding} />
      ))}
    </div>
  );
}
