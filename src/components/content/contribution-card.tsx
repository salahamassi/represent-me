"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { OSSContribution } from "@/types";

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  found: { color: "text-muted-foreground", label: "Found" },
  notified: { color: "text-blue-400", label: "Notified" },
  working: { color: "text-amber-400", label: "Working" },
  pr_opened: { color: "text-purple-400", label: "PR Open" },
  pr_merged: { color: "text-emerald-400", label: "Merged" },
  dismissed: { color: "text-muted-foreground/60", label: "Dismissed" },
};

const PIPELINE_STEPS = ["found", "notified", "working", "pr_opened", "pr_merged"];

export function ContributionCard({ contribution }: { contribution: OSSContribution }) {
  const config = STATUS_CONFIG[contribution.status] || STATUS_CONFIG.found;
  const currentStepIndex = PIPELINE_STEPS.indexOf(contribution.status);

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-medium text-foreground">{contribution.issue_title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {contribution.repo_owner}/{contribution.repo_name} #{contribution.issue_number}
            </p>
          </div>
          <Badge variant="outline" className={`text-xs ${config.color}`}>
            {config.label}
          </Badge>
        </div>

        {/* Pipeline visualization */}
        <div className="flex items-center gap-1">
          {PIPELINE_STEPS.map((step, i) => {
            const isCompleted = i <= currentStepIndex;
            const isCurrent = step === contribution.status;
            return (
              <div key={step} className="flex items-center">
                <div
                  className={`h-2 w-2 rounded-full ${
                    isCompleted
                      ? isCurrent
                        ? "bg-emerald-400 ring-2 ring-emerald-400/30"
                        : "bg-emerald-600"
                      : "bg-accent"
                  }`}
                />
                {i < PIPELINE_STEPS.length - 1 && (
                  <div
                    className={`h-0.5 w-6 ${
                      i < currentStepIndex ? "bg-emerald-600" : "bg-accent"
                    }`}
                  />
                )}
              </div>
            );
          })}
          <span className="ml-2 text-xs text-muted-foreground/60">
            {PIPELINE_STEPS.map((s) => STATUS_CONFIG[s]?.label).join(" → ")}
          </span>
        </div>

        {/* Labels */}
        {contribution.issue_labels && (
          <div className="flex flex-wrap gap-1">
            {JSON.parse(contribution.issue_labels).map((label: string) => (
              <Badge key={label} variant="outline" className="text-xs text-muted-foreground">
                {label}
              </Badge>
            ))}
          </div>
        )}

        {/* PR link */}
        {contribution.pr_url && (
          <a
            href={contribution.pr_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:underline"
          >
            View PR →
          </a>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground/60">
          <span>Found: {new Date(contribution.found_at).toLocaleDateString()}</span>
          {contribution.pr_merged_at && (
            <span className="text-emerald-400">
              Merged: {new Date(contribution.pr_merged_at).toLocaleDateString()}
            </span>
          )}
          {contribution.content_generated ? (
            <span className="text-emerald-400">Content ✓</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
