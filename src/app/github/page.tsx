"use client";

import { useEffect, useState } from "react";
import { useGitHubStore } from "@/store/github-store";
import { ProfileHeader } from "@/components/github/profile-header";
import { PinnedReposEditor } from "@/components/github/pinned-repos-editor";
import { ReadmeGenerator } from "@/components/github/readme-generator";
import { RepoRow } from "@/components/github/repo-row-expanded";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { IssueCard } from "@/components/issues/issue-card";
import { CodeGemCard } from "@/components/content/code-gem-card";
import { ActionPlan } from "@/components/github/action-plan";
import { GitHubScore } from "@/components/github/github-score";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Play, Loader2, RefreshCw, ArrowUpDown, Search, Gem } from "lucide-react";
import type { OSSContribution, CodeGem, ActivityLogEntry } from "@/types";

type SortKey = "name" | "stars" | "score" | "lastCommit";

export default function GitHubPage() {
  const profile = useGitHubStore((s) => s.profile);
  const repos = useGitHubStore((s) => s.repos);
  const insights = useGitHubStore((s) => s.insights);
  const activities = useGitHubStore((s) => s.activities);
  const contributions = useGitHubStore((s) => s.contributions);
  const gems = useGitHubStore((s) => s.gems);
  const loading = useGitHubStore((s) => s.loading);
  const activeTab = useGitHubStore((s) => s.activeTab);
  const analysisResult = useGitHubStore((s) => s.analysisResult);

  const fetchProfile = useGitHubStore((s) => s.fetchProfile);
  const fetchRepos = useGitHubStore((s) => s.fetchRepos);
  const fetchInsights = useGitHubStore((s) => s.fetchInsights);
  const setActiveTab = useGitHubStore((s) => s.setActiveTab);
  const runAnalysis = useGitHubStore((s) => s.runAnalysis);
  const triggerCodeGems = useGitHubStore((s) => s.triggerCodeGems);

  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortAsc, setSortAsc] = useState(false);
  const [filterOriginal, setFilterOriginal] = useState(true);

  useEffect(() => {
    fetchProfile();
    fetchInsights();
  }, [fetchProfile, fetchInsights]);

  // Sort repos
  const filteredRepos = repos.filter((r) => (filterOriginal ? !r.isFork : true));
  const sortedRepos = [...filteredRepos].sort((a, b) => {
    const dir = sortAsc ? 1 : -1;
    if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
    if (sortKey === "stars") return (a.stars - b.stars) * dir;
    if (sortKey === "score") return (a.healthScore - b.healthScore) * dir;
    if (sortKey === "lastCommit") return (new Date(a.lastCommit).getTime() - new Date(b.lastCommit).getTime()) * dir;
    return 0;
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">GitHub Agent</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your GitHub command center — live data, AI analysis, and content pipeline
          </p>
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading.analysis}
          className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            loading.analysis
              ? "cursor-not-allowed bg-muted text-muted-foreground"
              : "bg-emerald-600 text-white hover:bg-emerald-500"
          }`}
        >
          {loading.analysis ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing...</>
          ) : (
            <><Play className="h-4 w-4" /> Run AI Analysis</>
          )}
        </button>
      </div>

      {/* Analysis result notification */}
      {analysisResult && (
        <div className={`rounded-lg p-3 text-sm ${
          analysisResult.startsWith("Error")
            ? "bg-red-500/10 text-red-400 border border-red-500/20"
            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
        }`}>
          {analysisResult}
        </div>
      )}

      {/* Live Profile */}
      <ProfileHeader />

      {/* Score + Todos */}
      <GitHubScore />

      {/* Last run info */}
      {insights?.latestRun && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Last AI run: {new Date(insights.latestRun.started_at).toLocaleString()}</span>
          <Badge variant="outline" className="text-xs text-emerald-400">
            ${insights.latestRun.total_cost.toFixed(4)}
          </Badge>
          <span>{insights.latestRun.total_tokens.toLocaleString()} tokens</span>
          {insights.latestRun.duration_seconds && (
            <span>{insights.latestRun.duration_seconds}s</span>
          )}
          <span>{insights.latestRun.findings_count} findings</span>
        </div>
      )}

      {/* README Generator Modal */}
      <ReadmeGenerator />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="actions">Action Plan</TabsTrigger>
          <TabsTrigger value="insights">AI Insights</TabsTrigger>
          <TabsTrigger value="repos">
            Repo Audit
            {repos.length > 0 && (
              <Badge variant="outline" className="ml-1.5 text-xs">{repos.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="pinned">Pinned Repos</TabsTrigger>
          <TabsTrigger value="issues">
            Issues
            {contributions.length > 0 && (
              <Badge variant="outline" className="ml-1.5 text-xs">{contributions.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="gems">
            Code Gems
            {gems.length > 0 && (
              <Badge variant="outline" className="ml-1.5 text-xs">{gems.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        {/* Action Plan Tab */}
        <TabsContent value="actions" className="mt-4">
          <ActionPlan />
        </TabsContent>

        {/* AI Insights Tab */}
        <TabsContent value="insights" className="mt-4">
          {activities.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center">
              <p className="text-sm font-medium text-muted-foreground">No AI analysis yet</p>
              <p className="mt-1 text-xs text-muted-foreground/60">Click "Run AI Analysis" to get insights</p>
            </div>
          ) : (
            <ActivityFeed activities={activities as ActivityLogEntry[]} />
          )}
        </TabsContent>

        {/* Repo Audit Tab */}
        <TabsContent value="repos" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setFilterOriginal(true)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  filterOriginal ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
                )}
              >
                Original Only
              </button>
              <button
                onClick={() => setFilterOriginal(false)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  !filterOriginal ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
                )}
              >
                All Repos
              </button>
            </div>
            <button
              onClick={fetchRepos}
              disabled={loading.repos}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`h-3 w-3 ${loading.repos ? "animate-spin" : ""}`} />
              {repos.length > 0 ? "Refresh from GitHub" : "Load from GitHub"}
            </button>
          </div>

          {repos.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center">
              <p className="text-sm font-medium text-muted-foreground">
                {loading.repos ? "Loading repos from GitHub..." : "Repos not loaded yet"}
              </p>
              {!loading.repos && (
                <button onClick={fetchRepos} className="mt-2 text-xs text-blue-400 hover:underline">
                  Load from GitHub API
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    {[
                      { key: "name" as SortKey, label: "Repository" },
                      { key: "score" as SortKey, label: "Health" },
                      { key: "stars" as SortKey, label: "Stars" },
                      { key: "lastCommit" as SortKey, label: "Last Commit" },
                    ].map((col) => (
                      <th
                        key={col.key}
                        onClick={() => toggleSort(col.key)}
                        className="cursor-pointer px-4 py-3 text-left font-medium text-muted-foreground hover:text-foreground"
                      >
                        <span className="flex items-center gap-1">
                          {col.label}
                          <ArrowUpDown className="h-3 w-3" />
                        </span>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRepos.map((repo) => (
                    <RepoRow key={repo.name} repo={repo} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Pinned Repos Tab */}
        <TabsContent value="pinned" className="mt-4">
          <PinnedReposEditor />
        </TabsContent>

        {/* Issues Tab */}
        <TabsContent value="issues" className="mt-4">
          {contributions.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center">
              <Search className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No issues tracked yet</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Go to the Issues page and run the Issue Hunter
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {(contributions as OSSContribution[]).slice(0, 5).map((c) => (
                <IssueCard key={c.id} contribution={c} />
              ))}
              {contributions.length > 5 && (
                <a href="/issues" className="block text-center text-sm text-blue-400 hover:underline">
                  View all {contributions.length} issues →
                </a>
              )}
            </div>
          )}
        </TabsContent>

        {/* Code Gems Tab */}
        <TabsContent value="gems" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              Interesting patterns found in your repositories
            </p>
            <button
              onClick={triggerCodeGems}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Gem className="h-3 w-3" />
              Mine More Gems
            </button>
          </div>
          {gems.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center">
              <Gem className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No gems mined yet</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Click "Mine More Gems" to discover patterns in your code
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {(gems as CodeGem[]).map((gem) => (
                <CodeGemCard key={gem.id} gem={gem} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="mt-4">
          <ActivityFeed activities={activities as ActivityLogEntry[]} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
