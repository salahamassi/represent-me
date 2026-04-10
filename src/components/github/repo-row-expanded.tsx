"use client";

import { Badge } from "@/components/ui/badge";
import { useGitHubStore } from "@/store/github-store";
import { FileText, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GitHubRepo } from "@/types";

interface RepoWithScore extends GitHubRepo {
  healthScore: number;
}

function getScoreColor(score: number) {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

export function RepoRow({ repo }: { repo: RepoWithScore }) {
  const expandedRepo = useGitHubStore((s) => s.expandedRepo);
  const toggleExpanded = useGitHubStore((s) => s.toggleRepoExpanded);
  const generateReadme = useGitHubStore((s) => s.generateReadme);
  const isExpanded = expandedRepo === repo.name;

  return (
    <>
      <tr
        className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/50"
        onClick={() => toggleExpanded(repo.name)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
            <a
              href={repo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground hover:text-blue-400"
              onClick={(e) => e.stopPropagation()}
            >
              {repo.name}
            </a>
            {repo.language && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">{repo.language}</Badge>
            )}
            {repo.isFork && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground/60">fork</Badge>
            )}
          </div>
          {repo.description && (
            <p className="mt-0.5 ml-5 text-xs text-muted-foreground line-clamp-1">{repo.description}</p>
          )}
        </td>
        <td className="px-4 py-3">
          <span className={cn("font-mono font-medium", getScoreColor(repo.healthScore))}>
            {repo.healthScore}
          </span>
        </td>
        <td className="px-4 py-3 text-muted-foreground">{repo.stars}</td>
        <td className="px-4 py-3 text-xs text-muted-foreground">{repo.lastCommit.slice(0, 10)}</td>
        <td className="px-4 py-3">
          <div className="flex gap-1">
            {!repo.description && <Badge variant="outline" className="text-[10px] text-red-400">No desc</Badge>}
            {!repo.hasReadme && <Badge variant="outline" className="text-[10px] text-red-400">No README</Badge>}
            {repo.topics.length === 0 && <Badge variant="outline" className="text-[10px] text-amber-400">No topics</Badge>}
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr className="border-b border-border bg-muted/30">
          <td colSpan={5} className="px-4 py-4">
            <div className="ml-5 space-y-3">
              {/* Quick actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    generateReadme(repo.name);
                  }}
                  className="flex items-center gap-1.5 rounded-md bg-card px-3 py-1.5 text-xs font-medium text-foreground border border-border hover:bg-muted"
                >
                  <FileText className="h-3 w-3" />
                  Generate README
                </button>
                <a
                  href={repo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-md bg-card px-3 py-1.5 text-xs font-medium text-foreground border border-border hover:bg-muted"
                >
                  <ExternalLink className="h-3 w-3" />
                  View on GitHub
                </a>
              </div>

              {/* Repo details */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Language:</span>{" "}
                  <span className="text-foreground">{repo.language || "Unknown"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Forks:</span>{" "}
                  <span className="text-foreground">{repo.forks}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Topics:</span>{" "}
                  {repo.topics.length > 0 ? (
                    <span className="text-foreground">{repo.topics.join(", ")}</span>
                  ) : (
                    <span className="text-amber-400">None — add topics for discoverability</span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">Archived:</span>{" "}
                  <span className="text-foreground">{repo.isArchived ? "Yes" : "No"}</span>
                </div>
              </div>

              {/* Health breakdown */}
              <div className="rounded-lg bg-card p-3 border border-border">
                <p className="text-xs font-medium text-muted-foreground mb-1">Health Score Breakdown</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className={repo.description ? "text-emerald-400" : "text-red-400"}>
                    {repo.description ? "Description" : "No description"}
                  </span>
                  <span className={repo.hasReadme ? "text-emerald-400" : "text-red-400"}>
                    {repo.hasReadme ? "README" : "No README"}
                  </span>
                  <span className={repo.topics.length > 0 ? "text-emerald-400" : "text-amber-400"}>
                    {repo.topics.length > 0 ? `${repo.topics.length} topics` : "No topics"}
                  </span>
                  <span className={!repo.isFork ? "text-emerald-400" : "text-muted-foreground"}>
                    {!repo.isFork ? "Original" : "Fork"}
                  </span>
                  <span className="text-muted-foreground">{repo.stars} stars</span>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
