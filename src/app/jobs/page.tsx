"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "@/components/content/copy-button";
import { cn } from "@/lib/utils";
import {
  Search, Loader2, ExternalLink, Briefcase, Target, TrendingUp, FileText,
  Rocket, Building, Lightbulb, Plus, X, CheckCircle,
} from "lucide-react";

interface JobData {
  jobs: any[];
  highFit: any[];
  mediumFit: any[];
  score: { overall: number; categories: { label: string; score: number }[] };
  proactiveMode: boolean;
  targetCompanies: { name: string; why: string; url: string }[];
  outreachTips: { title: string; tip: string }[];
  stats: { total: number; highFit: number; mediumFit: number; applied: number; dismissed: number; withResume: number };
  preferences: any;
}

export default function JobsPage() {
  const [data, setData] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hunting, setHunting] = useState(false);
  const [huntResult, setHuntResult] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("matches");
  const [generating, setGenerating] = useState<string | null>(null);
  const [genModal, setGenModal] = useState<{
    coverLetter: string;
    resumeSections: { summary: string; experienceBullets: string; skillsOrder: string; whatToAdd: string; whatToRemove: string; applicationTips: string };
    jobTitle: string;
  } | null>(null);
  const [scanning, setScanning] = useState<string | null>(null);
  const [atsModal, setAtsModal] = useState<any | null>(null);

  // Bulk-action selection state. Scoped to the currently-visible tab —
  // switching tabs clears the selection so a Select-All on Matches
  // doesn't leak into Applied. `bulkProgress` powers the sticky bar's
  // "3/10" counter while the parallel run is in flight.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  // Bulk Reviewer modal — null when closed; otherwise carries the
  // ordered list of jobs being reviewed. The list is captured at open
  // time so a background generate finishing mid-review doesn't
  // reshuffle the modal under Salah's hands.
  const [reviewModal, setReviewModal] = useState<any[] | null>(null);
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectAllVisible = (ids: string[]) => setSelectedIds(new Set(ids));
  const clearSelection = () => setSelectedIds(new Set());

  const handleAtsScan = async (job: any) => {
    setScanning(job.id);
    try {
      const res = await fetch("/api/jobs/ats-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText: "__USE_ORIGINAL__",
          jobDescription: job.aiAnalysis?.reasoning || job.title,
          jobTitle: job.title,
        }),
      });
      const d = await res.json();
      if (d.success) setAtsModal({ ...d, jobTitle: job.title, jobId: job.id });
    } catch (err) {
      console.error("ATS scan failed:", err);
    } finally {
      setScanning(null);
    }
  };

  const [showAddJob, setShowAddJob] = useState(false);
  const [addJobForm, setAddJobForm] = useState({ url: "", description: "", title: "", company: "" });
  const [addingJob, setAddingJob] = useState(false);
  const [addJobResult, setAddJobResult] = useState<string | null>(null);

  const handleAddJob = async () => {
    if (!addJobForm.url && !addJobForm.description) return;
    setAddingJob(true);
    setAddJobResult(null);
    try {
      const res = await fetch("/api/jobs/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addJobForm),
      });
      const d = await res.json();
      if (d.success) {
        setAddJobResult(`Added! ${d.analysis.fitPercentage}% fit — ${d.analysis.jobTitle}`);
        setAddJobForm({ url: "", description: "", title: "", company: "" });
        const refreshRes = await fetch("/api/jobs");
        setData(await refreshRes.json());
        setTimeout(() => setShowAddJob(false), 2000);
      } else {
        setAddJobResult(d.error || "Failed to add job");
      }
    } catch (err) {
      setAddJobResult(`Error: ${err}`);
    } finally {
      setAddingJob(false);
    }
  };

  const [fixingResume, setFixingResume] = useState(false);
  const [tailoredModal, setTailoredModal] = useState<{ resume: string; message: string; jobTitle: string } | null>(null);

  const handleFixResume = async () => {
    if (!atsModal) return;
    setFixingResume(true);
    try {
      const job = data?.jobs.find((j: any) => j.title === atsModal.jobTitle);
      if (!job) return;

      const fixes = (atsModal.improvements || [])
        .map((imp: any) => `- ${imp.action} (${imp.reason})`)
        .join("\n");

      const missingKeywords = (atsModal.keywordMatch?.missing || []).join(", ");

      const sectionIssues = atsModal.sections
        ? Object.entries(atsModal.sections)
            .filter(([, val]: [string, any]) => val.score < 80)
            .map(([key, val]: [string, any]) => `${key}: ${val.score}/100 — ${(val.issues || []).join(", ")}`)
            .join("; ")
        : "";

      const res = await fetch("/api/jobs/fix-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: job.title,
          company: job.company,
          jobDescription: job.aiAnalysis?.reasoning || "",
          atsImprovements: fixes,
          missingKeywords,
        }),
      });
      const d = await res.json();
      if (d.success && d.docxFilename) {
        setAtsModal(null);
        // Auto-download the DOCX
        window.open(`/api/jobs/resume?file=${encodeURIComponent(d.docxFilename)}`, "_blank");
      } else if (d.success && d.tailoredResume) {
        setAtsModal(null);
        setTailoredModal({ resume: d.tailoredResume, message: d.message, jobTitle: job.title });
      }
    } catch (err) {
      console.error("Fix resume failed:", err);
    } finally {
      setFixingResume(false);
    }
  };

  const handleMarkApplied = async (jobId: string) => {
    await fetch("/api/jobs/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, action: "apply_later" }),
    });
    const res = await fetch("/api/jobs");
    setData(await res.json());
  };

  const handleUnmarkApplied = async (jobId: string) => {
    await fetch("/api/jobs/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, action: "unapply" }),
    });
    const res = await fetch("/api/jobs");
    setData(await res.json());
  };

  const handleGenerate = async (job: any) => {
    setGenerating(job.id);
    try {
      const res = await fetch("/api/jobs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          jobTitle: job.title,
          company: job.company,
          description: job.aiAnalysis?.reasoning || "",
          fitPercentage: job.fit_percentage,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setGenModal({ coverLetter: d.coverLetter, resumeSections: d.resumeSections || {}, jobTitle: job.title });
        const refreshRes = await fetch("/api/jobs");
        setData(await refreshRes.json());
      }
    } catch (err) {
      console.error("Generation failed:", err);
    } finally {
      setGenerating(null);
    }
  };

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Clear selection on tab switch so Select-All on one tab can't leak
  // its ids into a different filtered list.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeTab]);

  // Bulk Generate — runs the existing single-job handleGenerate in
  // parallel-3 against the user's current selection. Reusing
  // handleGenerate keeps Plan A's database contract intact: every kit
  // still goes through /api/jobs/generate → seen_jobs.coverLetter.
  const runBulkGenerate = async (targets: any[]) => {
    if (targets.length === 0) return;
    setBulkRunning(true);
    setBulkProgress({ done: 0, total: targets.length });
    const CONCURRENCY = 3;
    let cursor = 0;
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < targets.length) {
        const job = targets[cursor++];
        try {
          await handleGenerate(job);
        } catch (err) {
          console.error("[bulk] generate failed for", job.id, err);
        }
        setBulkProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    });
    await Promise.all(workers);
    setBulkRunning(false);
    clearSelection();
  };

  const runJobMatcher = async () => {
    setHunting(true);
    setHuntResult(null);
    try {
      const res = await fetch("/api/automation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: "job-matcher" }),
      });
      const d = await res.json();
      setHuntResult(d.success ? `Found ${d.findings} matches!` : d.error);
      const refreshRes = await fetch("/api/jobs");
      setData(await refreshRes.json());
    } catch (err) {
      setHuntResult(`Error: ${err}`);
    } finally {
      setHunting(false);
    }
  };

  if (loading || !data) {
    return <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">Loading job data...</div>;
  }

  const { stats, proactiveMode, targetCompanies, outreachTips, jobs } = data;

  // Single source of truth for which rows are showing on each row-bearing
  // tab. Sort by fit % DESC so the highest-priority leads sit on top.
  const byFit = (a: any, b: any) =>
    (b.fit_percentage || 0) - (a.fit_percentage || 0);
  const pendingJobs = jobs
    .filter((j: any) => j.user_action !== "apply_later")
    .sort(byFit);
  const appliedJobs = jobs
    .filter((j: any) => j.user_action === "apply_later")
    .sort(byFit);
  // What "Select All" should grab — only the rows the user is currently
  // looking at. Other tabs (targets / strategy / preferences) don't have
  // job rows, so the bulk bar is hidden for them entirely.
  const visibleJobs =
    activeTab === "applied"
      ? appliedJobs
      : activeTab === "matches"
        ? pendingJobs
        : [];
  const selectedVisibleJobs = visibleJobs.filter((j: any) =>
    selectedIds.has(j.id)
  );
  // Bulk Reviewer trigger: jobs in the selection that already have a
  // generated kit (cover letter persisted). When ≥1 has a kit, the
  // primary action flips from "Bulk Generate" to "Review & Ship". The
  // "Generate" path remains available for the rows that don't.
  const selectedReadyKits = selectedVisibleJobs.filter(
    (j: any) => !!j.coverLetter
  );
  const showReviewMode = selectedReadyKits.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Job Match</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AI-powered job matching + proactive outreach strategy
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAddJob(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
            <Plus className="h-4 w-4" /> Add a Job
          </button>
          <button onClick={runJobMatcher} disabled={hunting}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              hunting ? "cursor-not-allowed bg-muted text-muted-foreground" : "bg-emerald-600 text-white hover:bg-emerald-500"
            }`}>
            {hunting ? <><Loader2 className="h-4 w-4 animate-spin" /> Searching...</> : <><Search className="h-4 w-4" /> Auto-scan</>}
          </button>
        </div>
      </div>

      {huntResult && (
        <div className={`rounded-lg p-3 text-sm ${huntResult.startsWith("Error") ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
          {huntResult}
        </div>
      )}

      {/* Stats — the Applied tile jumps straight to the Applied tab. */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {[
          { icon: Briefcase, label: "Total Found", value: stats.total, color: "", targetTab: null },
          { icon: Target, label: "High Fit", value: stats.highFit, color: "text-emerald-400", targetTab: null },
          { icon: TrendingUp, label: "Medium Fit", value: stats.mediumFit, color: "text-amber-400", targetTab: null },
          { icon: FileText, label: "Resumes", value: stats.withResume, color: "text-blue-400", targetTab: null },
          { icon: Rocket, label: "Applied", value: stats.applied, color: "text-purple-400", targetTab: "applied" },
          { icon: Building, label: "Targets", value: targetCompanies.length, color: "text-cyan-400", targetTab: "targets" },
        ].map((stat) => (
          <Card
            key={stat.label}
            onClick={stat.targetTab ? () => setActiveTab(stat.targetTab!) : undefined}
            className={cn(
              "border-border bg-card",
              stat.targetTab && "cursor-pointer transition-colors hover:bg-accent/50"
            )}
          >
            <CardContent className="p-3 text-center">
              <stat.icon className={cn("h-4 w-4 mx-auto", stat.color || "text-muted-foreground")} />
              <p className={cn("mt-1 text-xl font-bold", stat.color)}>{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Proactive Mode Banner */}
      {proactiveMode && (
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Lightbulb className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">Proactive Mode Active</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Few matching jobs on boards right now. Check Target Companies and Outreach Strategy — your best path is contributing to open source → posting about it → attracting inbound opportunities.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk Action bar — sticky to the top of the scroll container so
          it stays in view while the user speed-clicks down the list.
          Only renders on the two row-bearing tabs (matches / applied). */}
      {(activeTab === "matches" || activeTab === "applied") &&
        selectedIds.size > 0 && (
          <div className="sticky top-2 z-40 flex items-center justify-between gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 backdrop-blur">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-semibold text-emerald-300">
                {selectedIds.size} selected
              </span>
              <button
                onClick={() =>
                  selectAllVisible(visibleJobs.map((j: any) => j.id))
                }
                disabled={bulkRunning}
                className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Select all ({visibleJobs.length})
              </button>
              <button
                onClick={clearSelection}
                disabled={bulkRunning}
                className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Clear
              </button>
            </div>
            {showReviewMode ? (
              <button
                onClick={() => setReviewModal(selectedReadyKits)}
                disabled={bulkRunning}
                className="flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CheckCircle className="h-4 w-4" />
                Review &amp; Ship {selectedReadyKits.length} Kit
                {selectedReadyKits.length === 1 ? "" : "s"}
              </button>
            ) : (
              <button
                onClick={() => runBulkGenerate(selectedVisibleJobs)}
                disabled={bulkRunning || selectedVisibleJobs.length === 0}
                className="flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bulkRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {bulkProgress.done}/{bulkProgress.total}
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4" />
                    Bulk Generate ({selectedVisibleJobs.length})
                  </>
                )}
              </button>
            )}
          </div>
        )}

      {(() => {
        return (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="matches">
                Jobs {pendingJobs.length > 0 && <Badge variant="outline" className="ml-1.5 text-xs">{pendingJobs.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="applied">
                Applied {appliedJobs.length > 0 && <Badge variant="outline" className="ml-1.5 text-xs text-purple-400">{appliedJobs.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="targets">
                Target Companies <Badge variant="outline" className="ml-1.5 text-xs">{targetCompanies.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="strategy">Outreach Strategy</TabsTrigger>
              <TabsTrigger value="preferences">Preferences</TabsTrigger>
            </TabsList>

            {/* Job Matches (pending — not applied yet) */}
            <TabsContent value="matches" className="mt-4">
              {pendingJobs.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center text-center">
                  <Briefcase className="h-8 w-8 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">
                    {appliedJobs.length > 0 ? "Nothing left to apply to" : "No jobs found yet"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/60">
                    {appliedJobs.length > 0
                      ? `All ${appliedJobs.length} matches are in the Applied tab`
                      : "Click \"Auto-scan\" to search, or check Target Companies for proactive outreach"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingJobs.map((job: any) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      generating={generating}
                      scanning={scanning}
                      selected={selectedIds.has(job.id)}
                      onToggleSelect={toggleSelect}
                      onGenerate={handleGenerate}
                      onAtsScan={handleAtsScan}
                      onMarkApplied={handleMarkApplied}
                      onUnmarkApplied={handleUnmarkApplied}
                      onViewKit={(j) =>
                        setGenModal({
                          coverLetter: j.coverLetter,
                          resumeSections: {
                            summary: "",
                            experienceBullets: "",
                            skillsOrder: "",
                            whatToAdd: "",
                            whatToRemove: "",
                            applicationTips: "",
                          },
                          jobTitle: j.title,
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Applied — jobs marked as applied, with Unmark to move back. */}
            <TabsContent value="applied" className="mt-4">
              {appliedJobs.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center text-center">
                  <CheckCircle className="h-8 w-8 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No applications yet</p>
                  <p className="mt-1 text-xs text-muted-foreground/60">
                    Mark a job as applied from the Jobs tab and it will move here
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {appliedJobs.length} application{appliedJobs.length !== 1 ? "s" : ""} — sorted by fit %.
                    Use &ldquo;Unmark&rdquo; to move a row back to Jobs if you ticked it by mistake.
                  </p>
                  {appliedJobs.map((job: any) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      generating={generating}
                      scanning={scanning}
                      selected={selectedIds.has(job.id)}
                      onToggleSelect={toggleSelect}
                      onGenerate={handleGenerate}
                      onAtsScan={handleAtsScan}
                      onMarkApplied={handleMarkApplied}
                      onUnmarkApplied={handleUnmarkApplied}
                      onViewKit={(j) =>
                        setGenModal({
                          coverLetter: j.coverLetter,
                          resumeSections: {
                            summary: "",
                            experienceBullets: "",
                            skillsOrder: "",
                            whatToAdd: "",
                            whatToRemove: "",
                            applicationTips: "",
                          },
                          jobTitle: j.title,
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </TabsContent>

        {/* Target Companies */}
        <TabsContent value="targets" className="mt-4">
          <p className="text-sm text-muted-foreground mb-4">Companies aligned with your Flutter + open source + DevRel expertise. Reach out even without open positions.</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {targetCompanies.map((c) => (
              <Card key={c.name} className="border-border bg-card">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">{c.name}</h3>
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-400 hover:underline">
                      <ExternalLink className="h-3 w-3" /> Careers
                    </a>
                  </div>
                  <p className="text-xs text-muted-foreground">{c.why}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Outreach Strategy */}
        <TabsContent value="strategy" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            You&apos;re not just a developer — you&apos;re a <span className="text-foreground font-medium">framework creator, OSS contributor, and technical writer</span>. Lead with that.
          </p>
          {outreachTips.map((tip, i) => (
            <Card key={i} className="border-border bg-card">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-foreground"><span className="text-emerald-400">{i + 1}.</span> {tip.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{tip.tip}</p>
              </CardContent>
            </Card>
          ))}

          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground">Sample Cold Outreach</h3>
              <div className="mt-2 rounded-lg bg-muted p-3 text-xs text-foreground leading-relaxed">
                <p>Hi [Name],</p>
                <p className="mt-2">I noticed [Company] uses Flutter in production. I created Flutter Bond — an open-source framework with 7 packages on pub.dev that helps teams build scalable Flutter apps faster.</p>
                <p className="mt-2">I&apos;ve been shipping production mobile apps for 5+ years (Swift + Flutter), led mobile teams as VP of Innovation, and actively contribute to the Flutter ecosystem (FlutterFire CLI, share_plus).</p>
                <p className="mt-2">Would love to chat about how I could contribute — whether as a senior engineer, consultant, or DevRel contributor.</p>
                <p className="mt-2">Best,<br />Salah Nahed</p>
              </div>
              <div className="mt-2">
                <CopyButton text={`Hi [Name],\n\nI noticed [Company] uses Flutter in production. I created Flutter Bond — an open-source framework with 7 packages on pub.dev that helps teams build scalable Flutter apps faster.\n\nI've been shipping production mobile apps for 5+ years (Swift + Flutter), led mobile teams as VP of Innovation, and actively contribute to the Flutter ecosystem (FlutterFire CLI, share_plus).\n\nWould love to chat about how I could contribute — whether as a senior engineer, consultant, or DevRel contributor.\n\nBest,\nSalah Nahed`} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences */}
        <TabsContent value="preferences" className="mt-4 space-y-4">
          <Card className="border-border bg-card">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Target Roles</h3>
              <div className="flex flex-wrap gap-1.5">
                {data.preferences.targetRoles.map((role: string) => (
                  <Badge key={role} variant="outline" className="text-xs text-foreground">{role}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Tech Stack</h3>
              <div className="space-y-2">
                <div>
                  <span className="text-xs text-muted-foreground">Primary: </span>
                  {data.preferences.techStack.primary.map((t: string) => <Badge key={t} variant="outline" className="text-xs text-emerald-400 ml-1">{t}</Badge>)}
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Secondary: </span>
                  {data.preferences.techStack.secondary.map((t: string) => <Badge key={t} variant="outline" className="text-xs text-amber-400 ml-1">{t}</Badge>)}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Location</h3>
                <p className="text-xs text-muted-foreground">{data.preferences.location.preference}</p>
                <p className="text-xs text-muted-foreground">From: {data.preferences.location.currentLocation}</p>
                <p className="text-xs text-muted-foreground">Open to: {data.preferences.location.targetRegions.join(", ")}</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Salary</h3>
                <p className="text-sm text-foreground">
                  ${data.preferences.salary.minimum.toLocaleString()} — ${data.preferences.salary.target.toLocaleString()}
                  <span className="text-xs text-muted-foreground"> /month</span>
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
        );
      })()}

      {/* Bulk Reviewer — full-screen overlay. Sidebar of selected jobs,
          two-column editable preview (cover letter + tailored resume),
          SHIP button that flips status + auto-advances. Edits persist
          via debounced PATCH /api/jobs/kit. */}
      {reviewModal && (
        <BulkReviewModal
          jobs={reviewModal}
          onClose={() => setReviewModal(null)}
          onShipped={async () => {
            // Refresh the page data so the shipped row drops out of
            // Matches and lands in Applied. Selection clears too —
            // shipped rows shouldn't stay selected.
            const res = await fetch("/api/jobs");
            setData(await res.json());
            clearSelection();
          }}
        />
      )}

      {/* Add a Job Modal */}
      {showAddJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="font-semibold text-foreground">Add a Job</h2>
              <button onClick={() => { setShowAddJob(false); setAddJobResult(null); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-muted-foreground">
                Found a job on LinkedIn, Indeed, or Glassdoor? Paste the URL or description here. Claude will analyze the fit and add it to your pipeline.
              </p>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Job URL (optional)</label>
                <input
                  type="url"
                  placeholder="https://linkedin.com/jobs/view/..."
                  value={addJobForm.url}
                  onChange={(e) => setAddJobForm({ ...addJobForm, url: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Job Title</label>
                  <input
                    type="text"
                    placeholder="Senior Flutter Developer"
                    value={addJobForm.title}
                    onChange={(e) => setAddJobForm({ ...addJobForm, title: e.target.value })}
                    className="mt-1 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Company</label>
                  <input
                    type="text"
                    placeholder="Company name"
                    value={addJobForm.company}
                    onChange={(e) => setAddJobForm({ ...addJobForm, company: e.target.value })}
                    className="mt-1 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Job Description (paste from the listing)</label>
                <textarea
                  placeholder="Paste the full job description here..."
                  value={addJobForm.description}
                  onChange={(e) => setAddJobForm({ ...addJobForm, description: e.target.value })}
                  rows={6}
                  className="mt-1 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none"
                />
              </div>

              {addJobResult && (
                <div className={`rounded-lg p-3 text-sm ${
                  addJobResult.startsWith("Added") ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}>
                  {addJobResult}
                </div>
              )}
            </div>
            <div className="border-t border-border px-5 py-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Claude will analyze fit against your profile</p>
              <button
                onClick={handleAddJob}
                disabled={addingJob || (!addJobForm.url && !addJobForm.description)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  addingJob || (!addJobForm.url && !addJobForm.description)
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-emerald-600 text-white hover:bg-emerald-500"
                )}
              >
                {addingJob ? <><Loader2 className="h-3 w-3 animate-spin" /> Analyzing...</> : "Analyze & Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tailored Resume Modal */}
      {tailoredModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div>
                <h2 className="font-semibold text-foreground">Tailored Resume: {tailoredModal.jobTitle}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Copy this content → paste into VisualCV/Enhancv → download as PDF</p>
              </div>
              <button onClick={() => setTailoredModal(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-5">
              <div className="flex justify-end mb-3">
                <CopyButton text={tailoredModal.resume} />
              </div>
              <div className="rounded-lg bg-muted p-5 text-sm text-foreground whitespace-pre-line leading-relaxed font-mono text-xs">
                {tailoredModal.resume}
              </div>
            </div>
            <div className="border-t border-border px-5 py-3 flex items-center justify-between">
              <div className="flex gap-2">
                <a href="https://app.enhancv.com" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors">
                  <ExternalLink className="h-3 w-3" /> Open Enhancv
                </a>
                <a href="https://www.visualcv.com/app" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors">
                  <ExternalLink className="h-3 w-3" /> Open VisualCV
                </a>
              </div>
              <button onClick={() => setTailoredModal(null)} className="rounded-md bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ATS Scan Modal */}
      {atsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-foreground">ATS Scan: {atsModal.jobTitle}</h2>
                <span className={cn("text-lg font-bold",
                  atsModal.atsScore >= 80 ? "text-emerald-400" :
                  atsModal.atsScore >= 60 ? "text-amber-400" : "text-red-400"
                )}>
                  {atsModal.atsScore}/100
                </span>
                <Badge variant="outline" className={cn("text-xs",
                  atsModal.verdict === "PASS" ? "text-emerald-400" :
                  atsModal.verdict === "BORDERLINE" ? "text-amber-400" : "text-red-400"
                )}>
                  {atsModal.verdict}
                </Badge>
              </div>
              <button onClick={() => setAtsModal(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="max-h-[65vh] overflow-y-auto p-5 space-y-4">
              {/* Keyword Match */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Keyword Match ({atsModal.keywordMatch?.percentage}%)</h3>
                <div className="flex flex-wrap gap-1">
                  {atsModal.keywordMatch?.found?.map((k: string) => (
                    <Badge key={k} variant="outline" className="text-xs text-emerald-400">{k} ✓</Badge>
                  ))}
                  {atsModal.keywordMatch?.missing?.map((k: string) => (
                    <Badge key={k} variant="outline" className="text-xs text-red-400">{k} ✗</Badge>
                  ))}
                </div>
              </div>

              {/* Section Scores */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Section Scores</h3>
                <div className="space-y-2">
                  {atsModal.sections && Object.entries(atsModal.sections).map(([key, val]: [string, any]) => (
                    <div key={key} className="flex items-center gap-3">
                      <span className="w-24 text-xs text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                      <div className="h-2 flex-1 rounded-full bg-muted">
                        <div className={cn("h-2 rounded-full",
                          val.score >= 80 ? "bg-emerald-500" : val.score >= 60 ? "bg-amber-500" : "bg-red-500"
                        )} style={{ width: `${val.score}%` }} />
                      </div>
                      <span className={cn("w-8 text-xs text-right",
                        val.score >= 80 ? "text-emerald-400" : val.score >= 60 ? "text-amber-400" : "text-red-400"
                      )}>{val.score}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Improvements */}
              {atsModal.improvements?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">Improvements</h3>
                  <div className="space-y-2">
                    {atsModal.improvements.map((imp: any, i: number) => (
                      <div key={i} className="rounded-lg bg-muted p-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={cn("text-[10px]",
                            imp.priority === "high" ? "text-red-400" : "text-amber-400"
                          )}>{imp.priority}</Badge>
                          <span className="text-sm text-foreground">{imp.action}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{imp.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Overall Feedback */}
              <div className="rounded-lg bg-muted p-3">
                <p className="text-sm text-foreground">{atsModal.overallFeedback}</p>
              </div>
            </div>
            {/* Action buttons */}
            <div className="border-t border-border px-5 py-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <a href="https://app.enhancv.com" target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
                    <ExternalLink className="h-3 w-3" /> Open Enhancv to Edit CV
                  </a>
                  <button
                    onClick={() => {
                      const job = data?.jobs.find((j: any) => j.title === atsModal.jobTitle);
                      if (job) { setAtsModal(null); handleGenerate(job); }
                    }}
                    className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors">
                    <FileText className="h-3 w-3" /> Get Suggestions
                  </button>
                </div>
                <button onClick={() => setAtsModal(null)} className="rounded-md bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">Close</button>
              </div>

              {/* Upload updated CV for re-scan */}
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground mb-2">Updated your CV? Upload it to re-scan:</p>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setScanning(atsModal.jobTitle);
                    const formData = new FormData();
                    formData.append("file", file);
                    formData.append("jobId", atsModal.jobId || "");
                    formData.append("jobTitle", atsModal.jobTitle);
                    formData.append("jobDescription", data?.jobs.find((j: any) => j.title === atsModal.jobTitle)?.aiAnalysis?.reasoning || "");
                    try {
                      const res = await fetch("/api/jobs/upload-scan", { method: "POST", body: formData });
                      const d = await res.json();
                      if (d.success) {
                        setAtsModal({ ...d, jobTitle: atsModal.jobTitle, jobId: atsModal.jobId });
                        // Refresh job data so skill badges update
                        const refreshed = await fetch("/api/jobs");
                        setData(await refreshed.json());
                      }
                    } catch (err) { console.error(err); }
                    finally { setScanning(null); }
                  }}
                  className="text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-emerald-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-emerald-500"
                />
                {scanning === atsModal.jobTitle && (
                  <span className="ml-2 text-xs text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin" /> Scanning...</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generation Modal */}
      {genModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="font-semibold text-foreground">Application Kit: {genModal.jobTitle}</h2>
              <button onClick={() => setGenModal(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-5 space-y-5">

              {/* Cover Letter */}
              {genModal.coverLetter && (
                <Section title="📝 Cover Letter" text={genModal.coverLetter} hint="Copy and paste into your email" />
              )}

              {/* Resume Sections */}
              {genModal.resumeSections?.summary && (
                <Section title="📌 Tailored Summary" text={genModal.resumeSections.summary} hint="Replace the summary section in your resume" />
              )}

              {genModal.resumeSections?.experienceBullets && (
                <Section title="💼 Experience Bullets (reordered)" text={genModal.resumeSections.experienceBullets} hint="Replace bullet points in your resume — ordered by relevance to this job" />
              )}

              {genModal.resumeSections?.skillsOrder && (
                <Section title="🛠 Skills (reordered)" text={genModal.resumeSections.skillsOrder} hint="Reorder skills section — most relevant first" />
              )}

              {genModal.resumeSections?.whatToAdd && (
                <Section title="➕ Add These" text={genModal.resumeSections.whatToAdd} hint="Missing from your resume — add before applying" color="text-emerald-400" />
              )}

              {genModal.resumeSections?.whatToRemove && (
                <Section title="➖ De-emphasize" text={genModal.resumeSections.whatToRemove} hint="Less relevant for this job — move down or remove" color="text-amber-400" />
              )}

              {genModal.resumeSections?.applicationTips && (
                <Section title="💡 Application Tips" text={genModal.resumeSections.applicationTips} hint="Specific advice for this application" />
              )}
            </div>
            <div className="border-t border-border px-5 py-3 flex items-center justify-between">
              <button
                onClick={() => {
                  const job = data?.jobs.find((j: any) => j.title === genModal.jobTitle);
                  if (job) { setGenModal(null); handleGenerate(job); }
                }}
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
              >
                <FileText className="h-3 w-3" /> Regenerate
              </button>
              <button onClick={() => setGenModal(null)} className="rounded-md bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Shared renderer for a single job row. Same markup for the Pending and
 * Applied tabs — the two tabs differ only in whether "Mark as Applied"
 * or "Unmark" is shown.
 */
function JobCard({
  job,
  generating,
  scanning,
  selected,
  onToggleSelect,
  onGenerate,
  onAtsScan,
  onMarkApplied,
  onUnmarkApplied,
  onViewKit,
}: {
  job: any;
  generating: string | null;
  scanning: string | null;
  selected: boolean;
  onToggleSelect: (jobId: string) => void;
  onGenerate: (job: any) => void;
  onAtsScan: (job: any) => void;
  onMarkApplied: (jobId: string) => void;
  onUnmarkApplied: (jobId: string) => void;
  onViewKit: (job: any) => void;
}) {
  const isApplied = job.user_action === "apply_later";
  return (
    <Card
      className={cn(
        "border-border bg-card transition-colors",
        selected && "border-emerald-500/60 bg-emerald-500/5"
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Far-left checkbox — speed-clickable down the list. The
              larger hit area (-m-1 p-1) makes it easier to land on
              without aiming precisely. */}
          <label className="mt-1 -m-1 cursor-pointer p-1">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(job.id)}
              aria-label={`Select ${job.title}`}
              className="h-4 w-4 cursor-pointer accent-emerald-500"
            />
          </label>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <a href={job.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground hover:text-blue-400">{job.title}</a>
              {job.resume_id && <Badge variant="outline" className="text-xs text-blue-400">Resume ✓</Badge>}
              {isApplied && <Badge variant="outline" className="text-xs text-purple-400">Applied</Badge>}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{job.company} · {job.source}</p>
          </div>
          <div className="text-right shrink-0">
            <span className={cn("text-lg font-bold", (job.fit_percentage || 0) >= 70 ? "text-emerald-400" : (job.fit_percentage || 0) >= 40 ? "text-amber-400" : "text-red-400")}>
              {job.fit_percentage || 0}%
            </span>
            <p className="text-xs text-muted-foreground">fit</p>
          </div>
        </div>
        {job.matchedSkills?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {job.matchedSkills.map((s: string) => <Badge key={s} variant="outline" className="text-xs text-emerald-400">{s}</Badge>)}
            {job.missingSkills?.slice(0, 3).map((s: string) => <Badge key={s} variant="outline" className="text-xs text-red-400">{s}</Badge>)}
          </div>
        )}
        {job.salary_estimate && <p className="mt-2 text-xs text-muted-foreground">Salary: {job.salary_estimate}</p>}

        {/* Action buttons */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => onGenerate(job)}
            disabled={generating === job.id}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              generating === job.id
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-500"
            )}
          >
            {generating === job.id ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Generating...</>
            ) : job.coverLetter ? (
              <><FileText className="h-3 w-3" /> Regenerate</>
            ) : (
              <><FileText className="h-3 w-3" /> Resume + Cover Letter</>
            )}
          </button>

          {job.coverLetter && (
            <button
              onClick={() => onViewKit(job)}
              className="flex items-center gap-1.5 rounded-md bg-emerald-600/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-600/30 transition-colors"
            >
              <FileText className="h-3 w-3" /> View Kit
            </button>
          )}

          <a
            href="/api/jobs/resume?file=SalahNahedResume.pdf"
            download="SalahNahedResume.pdf"
            className="flex items-center gap-1.5 rounded-md bg-purple-600/20 border border-purple-500/30 px-3 py-1.5 text-xs font-medium text-purple-400 hover:bg-purple-600/30 transition-colors"
          >
            <FileText className="h-3 w-3" /> Download CV
          </a>
          <button
            onClick={() => onAtsScan(job)}
            disabled={scanning === job.id}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              scanning === job.id
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-amber-600 text-white hover:bg-amber-500"
            )}
          >
            {scanning === job.id ? <><Loader2 className="h-3 w-3 animate-spin" /> Scanning...</> : <><Target className="h-3 w-3" /> ATS Scan</>}
          </button>
          {isApplied ? (
            <button
              onClick={() => onUnmarkApplied(job.id)}
              className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title="Move this row back to the Jobs tab"
            >
              <X className="h-3 w-3" /> Unmark
            </button>
          ) : (
            <button
              onClick={() => onMarkApplied(job.id)}
              className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
            >
              <CheckCircle className="h-3 w-3" /> Mark as Applied
            </button>
          )}
          {job.url && (
            <a href={job.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors">
              <ExternalLink className="h-3 w-3" /> Apply
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ title, text, hint, color }: { title: string; text: string; hint?: string; color?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <h3 className={`text-sm font-semibold ${color || "text-foreground"}`}>{title}</h3>
        <CopyButton text={text} />
      </div>
      {hint && <p className="text-xs text-muted-foreground mb-2">{hint}</p>}
      <div className="rounded-lg bg-muted p-4 text-sm text-foreground whitespace-pre-line leading-relaxed max-h-[250px] overflow-y-auto">
        {text}
      </div>
    </div>
  );
}

/**
 * Bulk Reviewer overlay — full-screen split-pane for verifying and
 * shipping multiple application kits in rapid succession. The 60-second
 * goal: scan the cover letter, sanity-check the tailored summary +
 * top-3 bullets, hit SHIP, repeat.
 *
 * Persistence: every edit fires a debounced PATCH to /api/jobs/kit
 * (~600ms after the last keystroke) so a 10-second perfecting pass on
 * a bullet point survives a reload. Per-field PATCH so concurrent
 * edits to different fields don't clobber each other.
 *
 * SHIP semantics: copy the cover letter to the clipboard, flip both
 * `user_action='applied'` and `mission_status='SHIPPED'` via
 * /api/jobs/ship, then auto-advance to the next un-shipped row in
 * the sidebar. When the last row ships, refresh the page data and
 * close the modal.
 */
function BulkReviewModal({
  jobs,
  onClose,
  onShipped,
}: {
  jobs: any[];
  onClose: () => void;
  onShipped: () => Promise<void> | void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  // Local edit state — initialized from props so the modal opens with
  // whatever's persisted. The original prop arrays aren't mutated.
  const [edits, setEdits] = useState(() =>
    jobs.map((j) => ({
      coverLetter: j.coverLetter || "",
      tailoredSummary: j.tailoredSummary || "",
      // Always 3 slots so the bullet UI renders consistently even
      // when Claude returned fewer (or none).
      resumeBullets: [
        (j.resumeBullets?.[0] as string) || "",
        (j.resumeBullets?.[1] as string) || "",
        (j.resumeBullets?.[2] as string) || "",
      ],
    }))
  );
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [shipping, setShipping] = useState(false);
  const [shippedIds, setShippedIds] = useState<Set<string>>(new Set());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeJob = jobs[activeIdx];
  const activeEdit = edits[activeIdx];

  // Debounced PATCH. Sends only the field(s) that changed so two
  // textareas being edited in quick succession don't race.
  const scheduleSave = useCallback(
    (jobId: string, fields: Record<string, unknown>) => {
      setSaveStatus("saving");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch("/api/jobs/kit", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId, ...fields }),
          });
          setSaveStatus(res.ok ? "saved" : "error");
        } catch {
          setSaveStatus("error");
        }
      }, 600);
    },
    []
  );

  const editCoverLetter = (text: string) => {
    setEdits((prev) =>
      prev.map((e, i) => (i === activeIdx ? { ...e, coverLetter: text } : e))
    );
    scheduleSave(activeJob.id, { coverLetter: text });
  };
  const editSummary = (text: string) => {
    setEdits((prev) =>
      prev.map((e, i) => (i === activeIdx ? { ...e, tailoredSummary: text } : e))
    );
    scheduleSave(activeJob.id, { tailoredSummary: text });
  };
  const editBullet = (idx: number, text: string) => {
    const newBullets = [...activeEdit.resumeBullets];
    newBullets[idx] = text;
    setEdits((prev) =>
      prev.map((e, i) => (i === activeIdx ? { ...e, resumeBullets: newBullets } : e))
    );
    scheduleSave(activeJob.id, { resumeBullets: newBullets });
  };

  // SHIP: clipboard → ship API → advance. The clipboard write must
  // happen synchronously inside the user-gesture handler (browsers
  // block writes from async-deferred contexts), so we do it first.
  const shipKit = async () => {
    if (shipping || shippedIds.has(activeJob.id)) return;
    setShipping(true);
    try {
      // 1. Clipboard — best-effort. Failure shouldn't block the ship.
      try {
        await navigator.clipboard.writeText(activeEdit.coverLetter);
      } catch (clipErr) {
        console.warn("[BulkReview] clipboard write failed", clipErr);
      }
      // 2. Server flip — both user_action and mission_status atomically.
      const res = await fetch("/api/jobs/ship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: activeJob.id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Optimistic update for the sidebar — actual data refresh happens
      // in onShipped so the sticky bar / Applied tab update too.
      const newShipped = new Set(shippedIds);
      newShipped.add(activeJob.id);
      setShippedIds(newShipped);
      // 3. Advance to the next un-shipped row in the list. If none
      // remain, refresh + close.
      const nextIdx = jobs.findIndex(
        (j, i) => i > activeIdx && !newShipped.has(j.id)
      );
      if (nextIdx === -1) {
        // Last one — refresh and close.
        await onShipped();
        onClose();
        return;
      }
      setActiveIdx(nextIdx);
      setSaveStatus("idle");
    } catch (err) {
      console.error("[BulkReview] ship failed", err);
      alert("Ship failed — check console.");
    } finally {
      setShipping(false);
    }
  };

  const remaining = jobs.length - shippedIds.size;
  const isShippedNow = shippedIds.has(activeJob.id);

  return (
    <div className="fixed inset-0 z-50 flex bg-black/80 backdrop-blur-sm">
      {/* Sidebar — selected jobs list */}
      <div className="flex w-72 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Review &amp; Ship</h2>
            <p className="text-xs text-muted-foreground">
              {remaining} of {jobs.length} remaining
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close reviewer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {jobs.map((j, i) => {
            const isShipped = shippedIds.has(j.id);
            const isActive = i === activeIdx;
            return (
              <li key={j.id}>
                <button
                  onClick={() => setActiveIdx(i)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left transition-colors hover:bg-accent/40",
                    isActive && "border-l-2 border-l-emerald-500 bg-emerald-500/10",
                    isShipped && "opacity-50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {isShipped ? (
                      <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    ) : (
                      <span className="h-3 w-3 shrink-0 rounded-full border border-muted-foreground" />
                    )}
                    <span className="truncate text-sm font-medium text-foreground">
                      {j.title}
                    </span>
                  </div>
                  <p className="ml-5 truncate text-xs text-muted-foreground">
                    {j.company} · {j.fit_percentage || 0}% fit
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Main pane — header + 2-column editable preview */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-foreground">
              {activeJob.title}
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              {activeJob.company} · {activeJob.fit_percentage || 0}% fit
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "wr-mono text-xs",
                saveStatus === "saving" && "text-amber-400",
                saveStatus === "saved" && "text-emerald-400",
                saveStatus === "error" && "text-red-400",
                saveStatus === "idle" && "text-transparent"
              )}
            >
              {saveStatus === "saving"
                ? "Saving…"
                : saveStatus === "saved"
                  ? "✓ Saved"
                  : saveStatus === "error"
                    ? "Save failed"
                    : "·"}
            </span>
            <button
              onClick={shipKit}
              disabled={shipping || isShippedNow}
              className={cn(
                "flex items-center gap-2 rounded-md px-5 py-2 text-sm font-bold tracking-wide text-white transition-colors",
                isShippedNow
                  ? "cursor-default bg-emerald-700"
                  : "bg-emerald-600 hover:bg-emerald-500",
                shipping && "cursor-wait"
              )}
            >
              {shipping ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isShippedNow ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <Rocket className="h-4 w-4" />
              )}
              {isShippedNow ? "SHIPPED" : "SHIP KIT"}
            </button>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-2 overflow-hidden">
          {/* Center-left: Cover letter (editable) */}
          <div className="flex flex-col overflow-hidden border-r border-border">
            <div className="border-b border-border bg-muted/30 px-4 py-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cover Letter
              </h4>
            </div>
            <textarea
              value={activeEdit.coverLetter}
              onChange={(e) => editCoverLetter(e.target.value)}
              disabled={isShippedNow}
              className="flex-1 resize-none border-0 bg-transparent p-4 font-mono text-sm leading-relaxed text-foreground focus:outline-none focus:ring-0 disabled:opacity-60"
              placeholder="(no cover letter generated — re-run Generate)"
              aria-label="Cover letter"
            />
          </div>

          {/* Center-right: Tailored summary + top-3 bullets (editable) */}
          <div className="flex flex-col overflow-hidden">
            <div className="border-b border-border bg-muted/30 px-4 py-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tailored Resume
              </h4>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Tailored Summary
                </label>
                <textarea
                  value={activeEdit.tailoredSummary}
                  onChange={(e) => editSummary(e.target.value)}
                  disabled={isShippedNow}
                  rows={5}
                  className="mt-1 w-full resize-none rounded-md border border-border bg-card p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-60"
                  placeholder="(summary will appear here once Generate runs)"
                  aria-label="Tailored summary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Top 3 Bullets
                </label>
                <div className="mt-1 space-y-2">
                  {[0, 1, 2].map((idx) => (
                    <textarea
                      key={idx}
                      value={activeEdit.resumeBullets[idx] || ""}
                      onChange={(e) => editBullet(idx, e.target.value)}
                      disabled={isShippedNow}
                      rows={3}
                      className="w-full resize-none rounded-md border border-border bg-card p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-60"
                      placeholder={`Bullet ${idx + 1}`}
                      aria-label={`Resume bullet ${idx + 1}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
