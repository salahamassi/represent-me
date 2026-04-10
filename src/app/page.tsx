"use client";

import { useAgentStore } from "@/store/agent-store";
import { AgentCard } from "@/components/agents/agent-card";
import { PresenceScoreGauge } from "@/components/dashboard/presence-score";
import { ScoreBreakdown } from "@/components/dashboard/score-breakdown";
import { QuickWins } from "@/components/dashboard/quick-wins";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentId } from "@/types";

const AGENT_IDS: AgentId[] = ["github", "linkedin", "resume", "job-matcher", "content"];

export default function DashboardPage() {
  const agents = useAgentStore((s) => s.agents);
  const presenceScore = useAgentStore((s) => s.presenceScore);
  const hasRun = Object.values(agents).some((a) => a.status === "done");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome back, Salah</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your agents are ready to analyze and improve your online presence.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="border-border bg-card lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Overall Score
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <PresenceScoreGauge score={hasRun ? presenceScore.overall : 0} />
            {!hasRun && (
              <p className="mt-2 text-center text-xs text-muted-foreground/60">
                Run agents to calculate your score
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Score Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasRun ? (
              <ScoreBreakdown scores={presenceScore} />
            ) : (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground/60">
                Run agents to see your breakdown
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Agents</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {AGENT_IDS.map((id) => (
            <AgentCard key={id} agent={agents[id]} />
          ))}
        </div>
      </div>

      {hasRun && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Quick Wins
            </CardTitle>
          </CardHeader>
          <CardContent>
            <QuickWins />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
