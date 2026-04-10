"use client";

import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SEVERITY_CONFIG } from "@/lib/constants";
import type { Finding } from "@/types";

const SEVERITY_ICONS = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  positive: CheckCircle2,
};

export function FindingCard({ finding }: { finding: Finding }) {
  const config = SEVERITY_CONFIG[finding.severity];
  const Icon = SEVERITY_ICONS[finding.severity];

  return (
    <div className={cn("rounded-lg border p-4", config.bg, config.border)}>
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", config.color)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className={cn("text-sm font-medium", config.color)}>{finding.title}</h4>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {finding.category}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{finding.description}</p>
          {finding.evidence && (
            <div className="mt-2 rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
              {finding.evidence}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
