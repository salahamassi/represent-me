"use client";

import { useEffect, useState } from "react";
import { IssueCard } from "@/components/issues/issue-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { OSSContribution } from "@/types";
import { Loader2, Search, Play } from "lucide-react";

const STATUS_FILTERS = [
  { id: "", label: "All" },
  { id: "notified", label: "New" },
  { id: "working", label: "Working" },
  { id: "pr_opened", label: "PR Open" },
  { id: "pr_merged", label: "Merged" },
  { id: "dismissed", label: "Dismissed" },
];

export default function IssuesPage() {
  const [contributions, setContributions] = useState<OSSContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [hunting, setHunting] = useState(false);
  const [filter, setFilter] = useState("");
  const [huntResult, setHuntResult] = useState<string | null>(null);

  const fetchIssues = async () => {
    setLoading(true);
    try {
      const url = filter ? `/api/issues?status=${filter}` : "/api/issues";
      const res = await fetch(url);
      const data = await res.json();
      setContributions(data);
    } catch (err) {
      console.error("Failed to fetch issues:", err);
    } finally {
      setLoading(false);
    }
  };

  const runHunter = async () => {
    setHunting(true);
    setHuntResult(null);
    try {
      const res = await fetch("/api/automation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: "issue-hunter" }),
      });
      const data = await res.json();
      setHuntResult(
        data.success
          ? `Found ${data.findings} new issues!`
          : `Error: ${data.error}`
      );
      // Refresh the list
      await fetchIssues();
    } catch (err) {
      setHuntResult(`Error: ${err}`);
    } finally {
      setHunting(false);
    }
  };

  useEffect(() => {
    fetchIssues();
  }, [filter]);

  // Stats
  const stats = {
    total: contributions.length,
    working: contributions.filter((c) => c.status === "working").length,
    prOpen: contributions.filter((c) => c.status === "pr_opened").length,
    merged: contributions.filter((c) => c.status === "pr_merged").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Issue Hunter</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Find open-source issues matching your skills, solve them, and build your reputation
          </p>
        </div>
        <button
          onClick={runHunter}
          disabled={hunting}
          className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            hunting
              ? "cursor-not-allowed bg-muted text-muted-foreground"
              : "bg-emerald-600 text-white hover:bg-emerald-500"
          }`}
        >
          {hunting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Hunting...
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              Hunt Issues
            </>
          )}
        </button>
      </div>

      {/* Hunt result notification */}
      {huntResult && (
        <div
          className={`rounded-lg p-3 text-sm ${
            huntResult.startsWith("Error")
              ? "bg-red-500/10 text-red-400 border border-red-500/20"
              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
          }`}
        >
          {huntResult}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-border bg-card">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Found</p>
            <p className="mt-0.5 text-lg font-semibold text-foreground">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Working On</p>
            <p className="mt-0.5 text-lg font-semibold text-amber-400">{stats.working}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">PRs Open</p>
            <p className="mt-0.5 text-lg font-semibold text-purple-400">{stats.prOpen}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Merged</p>
            <p className="mt-0.5 text-lg font-semibold text-emerald-400">{stats.merged}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.id
                ? "bg-emerald-600 text-white"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Issue list */}
      {loading ? (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground/60">
          Loading issues...
        </div>
      ) : contributions.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center text-center">
          <Search className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No issues found yet</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Click "Hunt Issues" to search for open-source issues matching your skills
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {contributions.map((c) => (
            <IssueCard key={c.id} contribution={c as OSSContribution} />
          ))}
        </div>
      )}
    </div>
  );
}
