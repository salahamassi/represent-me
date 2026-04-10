"use client";

import { useEffect, useState } from "react";
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {[
          { icon: Briefcase, label: "Total Found", value: stats.total, color: "" },
          { icon: Target, label: "High Fit", value: stats.highFit, color: "text-emerald-400" },
          { icon: TrendingUp, label: "Medium Fit", value: stats.mediumFit, color: "text-amber-400" },
          { icon: FileText, label: "Resumes", value: stats.withResume, color: "text-blue-400" },
          { icon: Rocket, label: "Applied", value: stats.applied, color: "text-purple-400" },
          { icon: Building, label: "Targets", value: targetCompanies.length, color: "text-cyan-400" },
        ].map((stat) => (
          <Card key={stat.label} className="border-border bg-card">
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="matches">
            Jobs {stats.total > 0 && <Badge variant="outline" className="ml-1.5 text-xs">{stats.total}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="targets">
            Target Companies <Badge variant="outline" className="ml-1.5 text-xs">{targetCompanies.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="strategy">Outreach Strategy</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        {/* Job Matches */}
        <TabsContent value="matches" className="mt-4">
          {jobs.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center">
              <Briefcase className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No jobs found yet</p>
              <p className="mt-1 text-xs text-muted-foreground/60">Click &quot;Find Jobs&quot; to search, or check Target Companies for proactive outreach</p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.sort((a: any, b: any) => (b.fit_percentage || 0) - (a.fit_percentage || 0)).map((job: any) => (
                <Card key={job.id} className={cn("border-border bg-card", job.user_action === "apply_later" && "opacity-50")}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <a href={job.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground hover:text-blue-400">{job.title}</a>
                          {job.resume_id && <Badge variant="outline" className="text-xs text-blue-400">Resume ✓</Badge>}
                          {job.user_action === "apply_later" && <Badge variant="outline" className="text-xs text-purple-400">Applied</Badge>}
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
                      {/* Generate / Regenerate button — always available */}
                      <button
                        onClick={() => handleGenerate(job)}
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

                      {/* View Application Kit — if already generated */}
                      {job.coverLetter && (
                        <button
                          onClick={() => setGenModal({ coverLetter: job.coverLetter, resumeSections: { summary: "", experienceBullets: "", skillsOrder: "", whatToAdd: "", whatToRemove: "", applicationTips: "" }, jobTitle: job.title })}
                          className="flex items-center gap-1.5 rounded-md bg-emerald-600/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-600/30 transition-colors"
                        >
                          <FileText className="h-3 w-3" /> View Kit
                        </button>
                      )}

                      {/* Download Original Resume */}
                      <a
                        href="/api/jobs/resume?file=SalahNahedResume.pdf"
                        download="SalahNahedResume.pdf"
                        className="flex items-center gap-1.5 rounded-md bg-purple-600/20 border border-purple-500/30 px-3 py-1.5 text-xs font-medium text-purple-400 hover:bg-purple-600/30 transition-colors"
                      >
                        <FileText className="h-3 w-3" /> Download CV
                      </a>
                      <button
                        onClick={() => handleAtsScan(job)}
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
                      {job.user_action !== "apply_later" && (
                        <button
                          onClick={() => handleMarkApplied(job.id)}
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
