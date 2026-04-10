"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "@/components/content/copy-button";
import { cn } from "@/lib/utils";
import {
  Play, Loader2, ExternalLink, Star, Users, MessageSquare, TrendingUp,
  Check, Circle,
} from "lucide-react";

interface LinkedInData {
  profile: {
    firstName: string;
    lastName: string;
    headline: string;
    summary: string;
    industry: string;
    location: string;
    profileUrl: string;
    registeredAt: string;
  };
  recommendations: {
    received: { firstName: string; lastName: string; company: string; jobTitle: string; text: string; date: string }[];
    given: { firstName: string; lastName: string; company: string; date: string }[];
  };
  network: { totalInvitations: number; incoming: number; outgoing: number; recentIncoming30Days: number };
  scores: { headline: number; summary: number; recommendations: number; network: number; activity: number; overall: number };
  actions: { id: string; title: string; description: string; priority: string; category: string }[];
}

export default function LinkedInPage() {
  const [data, setData] = useState<LinkedInData | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    fetch("/api/linkedin")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const runAI = async () => {
    setAnalyzing(true);
    setAiResult(null);
    try {
      const res = await fetch("/api/automation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: "linkedin" }),
      });
      const d = await res.json();
      setAiResult(d.success ? `${d.findings} findings generated` : d.error);
    } catch (err) {
      setAiResult(`Error: ${err}`);
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading || !data) {
    return <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">Loading LinkedIn data...</div>;
  }

  const { profile, recommendations, network, scores, actions } = data;
  const getScoreColor = (s: number) => s >= 80 ? "text-emerald-400" : s >= 50 ? "text-amber-400" : "text-red-400";
  const getScoreBg = (s: number) => s >= 80 ? "stroke-emerald-500" : s >= 50 ? "stroke-amber-500" : "stroke-red-500";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">LinkedIn Agent</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your LinkedIn presence — real data from your export
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href={profile.profileUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ExternalLink className="h-3 w-3" /> View Profile
          </a>
          <button onClick={runAI} disabled={analyzing}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              analyzing ? "cursor-not-allowed bg-muted text-muted-foreground" : "bg-emerald-600 text-white hover:bg-emerald-500"
            }`}>
            {analyzing ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing...</> : <><Play className="h-4 w-4" /> Run AI Analysis</>}
          </button>
        </div>
      </div>

      {aiResult && (
        <div className={`rounded-lg p-3 text-sm ${aiResult.startsWith("Error") ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
          {aiResult}
        </div>
      )}

      {/* Score + Profile Summary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Score Gauge */}
        <Card className="border-border bg-card">
          <CardContent className="p-5 flex items-center gap-5">
            <div className="relative h-20 w-20 shrink-0">
              <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36">
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" className="stroke-muted" strokeWidth="3" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" className={getScoreBg(scores.overall)} strokeWidth="3" strokeDasharray={`${scores.overall}, 100`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={cn("text-xl font-bold", getScoreColor(scores.overall))}>{scores.overall}</span>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">LinkedIn Score</h3>
              <div className="mt-2 space-y-1 text-xs">
                {[
                  { label: "Headline", score: scores.headline },
                  { label: "Summary", score: scores.summary },
                  { label: "Recommendations", score: scores.recommendations },
                  { label: "Network", score: scores.network },
                  { label: "Activity", score: scores.activity },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-2">
                    <span className="w-24 text-muted-foreground">{s.label}</span>
                    <div className="h-1.5 flex-1 rounded-full bg-muted">
                      <div className={cn("h-1.5 rounded-full", s.score >= 80 ? "bg-emerald-500" : s.score >= 50 ? "bg-amber-500" : "bg-red-500")}
                        style={{ width: `${s.score}%` }} />
                    </div>
                    <span className={cn("w-6 text-right", getScoreColor(s.score))}>{s.score}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <Card className="border-border bg-card lg:col-span-2">
          <CardContent className="p-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { icon: Star, label: "Recommendations", value: recommendations.received.length, color: "text-amber-400" },
                { icon: MessageSquare, label: "Given", value: recommendations.given.length, color: "text-blue-400" },
                { icon: Users, label: "Incoming Invites", value: network.incoming, color: "text-emerald-400" },
                { icon: TrendingUp, label: "Last 30 Days", value: network.recentIncoming30Days, color: "text-purple-400" },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <stat.icon className={cn("h-5 w-5 mx-auto", stat.color)} />
                  <p className={cn("mt-1 text-2xl font-bold", stat.color)}>{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg bg-muted p-3">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{profile.firstName} {profile.lastName}</span> · {profile.headline}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Member since {new Date(profile.registeredAt).getFullYear()} · {profile.industry} · {profile.location}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Plan (always visible) */}
      <Card className="border-border bg-card">
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Action Plan</h3>
          <div className="space-y-2">
            {actions.map((action) => (
              <div key={action.id} className="flex items-start gap-2.5">
                <Circle className={cn("h-3 w-3 mt-0.5 shrink-0",
                  action.priority === "high" ? "text-red-400" : "text-amber-400"
                )} />
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-foreground">{action.title}</span>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </div>
                <Badge variant="outline" className={cn("text-[10px] shrink-0",
                  action.priority === "high" ? "text-red-400" : "text-amber-400"
                )}>
                  {action.priority}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Profile</TabsTrigger>
          <TabsTrigger value="recommendations">
            Recommendations
            <Badge variant="outline" className="ml-1.5 text-xs">{recommendations.received.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="network">Network</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Headline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start justify-between">
                <p className="text-sm text-foreground">{profile.headline}</p>
                <CopyButton text={profile.headline} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">About</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-foreground whitespace-pre-line">{profile.summary}</p>
                <CopyButton text={profile.summary} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recommendations Tab */}
        <TabsContent value="recommendations" className="mt-4 space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Received ({recommendations.received.length})</h3>
          {recommendations.received.map((rec, i) => (
            <Card key={i} className="border-border bg-card">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-foreground">{rec.firstName} {rec.lastName}</span>
                    <span className="text-xs text-muted-foreground"> · {rec.jobTitle} at {rec.company}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(rec.date).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{rec.text.slice(0, 250)}...</p>
              </CardContent>
            </Card>
          ))}

          <h3 className="text-sm font-medium text-muted-foreground mt-6">Given ({recommendations.given.length})</h3>
          {recommendations.given.map((rec, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-foreground">{rec.firstName} {rec.lastName}</span>
              <span className="text-xs text-muted-foreground">at {rec.company}</span>
              <span className="text-xs text-muted-foreground">{new Date(rec.date).toLocaleDateString()}</span>
            </div>
          ))}
        </TabsContent>

        {/* Network Tab */}
        <TabsContent value="network" className="mt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="border-border bg-card">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-foreground">{network.totalInvitations}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Invitations</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-emerald-400">{network.incoming}</p>
                <p className="text-xs text-muted-foreground mt-1">People found YOU</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-amber-400">{network.outgoing}</p>
                <p className="text-xs text-muted-foreground mt-1">You reached out</p>
              </CardContent>
            </Card>
          </div>
          <Card className="border-border bg-card mt-4">
            <CardContent className="p-4">
              <p className="text-sm text-foreground">
                <span className="font-medium text-emerald-400">{Math.round((network.incoming / network.totalInvitations) * 100)}%</span> of your connections came to you — that&apos;s great organic reach.
                But with only <span className="font-medium text-amber-400">{network.outgoing}</span> outgoing requests, you&apos;re leaving growth on the table.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Sending 10+ targeted requests per week to mobile dev leads, recruiters, and Flutter/iOS community members can significantly increase your visibility.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
