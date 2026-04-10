"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { OSSContribution } from "@/types";

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  found: { color: "text-muted-foreground", bg: "bg-zinc-500/10", label: "Found" },
  notified: { color: "text-blue-400", bg: "bg-blue-500/10", label: "Notified" },
  working: { color: "text-amber-400", bg: "bg-amber-500/10", label: "Working" },
  pr_opened: { color: "text-purple-400", bg: "bg-purple-500/10", label: "PR Open" },
  pr_merged: { color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Merged 🎉" },
  dismissed: { color: "text-muted-foreground/60", bg: "bg-zinc-500/10", label: "Dismissed" },
};

const DIFFICULTY_CONFIG: Record<string, { emoji: string; color: string }> = {
  beginner: { emoji: "🟢", color: "text-emerald-400" },
  intermediate: { emoji: "🟡", color: "text-amber-400" },
  advanced: { emoji: "🔴", color: "text-red-400" },
};

interface IssueAnalysis {
  issueType: string;
  difficulty: string;
  estimatedHours: number;
  skillMatch: number;
  approachSummary: string;
  approachSteps: string[];
  relevantSkills: string[];
  potentialChallenges: string[];
  learningValue: string;
  contentPotential: string;
}

export function IssueCard({ contribution }: { contribution: OSSContribution }) {
  const status = STATUS_CONFIG[contribution.status] || STATUS_CONFIG.found;
  let analysis: IssueAnalysis | null = null;

  try {
    if (contribution.ai_analysis) {
      analysis = JSON.parse(contribution.ai_analysis);
    }
  } catch { /* ignore parse errors */ }

  const difficulty = analysis ? DIFFICULTY_CONFIG[analysis.difficulty] : null;

  return (
    <Card className="border-border bg-card transition-colors hover:bg-muted">
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <a
              href={contribution.github_issue_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-foreground hover:text-blue-400 transition-colors"
            >
              {contribution.issue_title}
            </a>
            <p className="mt-1 text-sm text-muted-foreground">
              {contribution.repo_owner}/{contribution.repo_name} #{contribution.issue_number}
            </p>
          </div>
          <Badge variant="outline" className={`shrink-0 ${status.color} ${status.bg}`}>
            {status.label}
          </Badge>
        </div>

        {/* Analysis badges */}
        {analysis && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {analysis.issueType}
            </Badge>
            {difficulty && (
              <span className={`text-xs ${difficulty.color}`}>
                {difficulty.emoji} {analysis.difficulty}
              </span>
            )}
            <span className="text-xs text-muted-foreground">~{analysis.estimatedHours}h</span>
            <Badge
              variant="outline"
              className={`text-xs ${
                analysis.skillMatch >= 70
                  ? "text-emerald-400"
                  : analysis.skillMatch >= 50
                    ? "text-amber-400"
                    : "text-red-400"
              }`}
            >
              {analysis.skillMatch}% match
            </Badge>
          </div>
        )}

        {/* Approach */}
        {analysis && (
          <div className="space-y-2">
            <p className="text-sm text-foreground">{analysis.approachSummary}</p>

            <div className="rounded-lg bg-muted p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">How to solve it:</p>
              {analysis.approachSteps.map((step, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  {i + 1}. {step}
                </p>
              ))}
            </div>

            {/* Skills + Learning */}
            <div className="flex flex-wrap gap-1">
              {analysis.relevantSkills.map((skill) => (
                <Badge key={skill} variant="outline" className="text-xs text-emerald-400">
                  {skill}
                </Badge>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              <span className="text-muted-foreground">Learn:</span> {analysis.learningValue}
            </p>
          </div>
        )}

        {/* PR link */}
        {contribution.pr_url && (
          <a
            href={contribution.pr_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-blue-400 hover:underline"
          >
            View PR →
          </a>
        )}

        {/* Footer */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground/60">
          <span>Found {new Date(contribution.found_at).toLocaleDateString()}</span>
          {contribution.pr_merged_at && (
            <span className="text-emerald-400">
              Merged {new Date(contribution.pr_merged_at).toLocaleDateString()}
            </span>
          )}
          {analysis?.contentPotential === "high" && (
            <Badge variant="outline" className="text-xs text-purple-400">
              High content potential
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
