"use client";

import { useEffect, useState } from "react";
import { useAutomationStore } from "@/store/automation-store";
import { useActivityStore } from "@/store/activity-store";
import { ScheduleCard } from "@/components/automation/schedule-card";
import { RunHistory } from "@/components/automation/run-history";
import { TelegramStatus } from "@/components/automation/telegram-status";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScheduleConfig, AutomationRun, ActivityLogEntry } from "@/types";

export default function AutomationPage() {
  const schedules = useAutomationStore((s) => s.schedules);
  const history = useAutomationStore((s) => s.history);
  const loading = useAutomationStore((s) => s.loading);
  const fetchStatus = useAutomationStore((s) => s.fetchStatus);
  const fetchHistory = useAutomationStore((s) => s.fetchHistory);

  const activities = useActivityStore((s) => s.activities);
  const costs = useActivityStore((s) => s.costs);
  const fetchActivities = useActivityStore((s) => s.fetchActivities);

  useEffect(() => {
    fetchStatus();
    fetchHistory();
    fetchActivities();

    const interval = setInterval(() => {
      fetchStatus();
      fetchHistory();
      fetchActivities();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchStatus, fetchHistory, fetchActivities]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Automation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage scheduled agent runs and Telegram notifications
        </p>
      </div>

      {/* Cost Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border bg-card">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">AI Cost Today</p>
            <p className="mt-0.5 text-base font-semibold text-emerald-400">
              ${costs.today.toFixed(4)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">This Week</p>
            <p className="mt-0.5 text-base font-semibold text-emerald-400">
              ${costs.week.toFixed(4)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">This Month</p>
            <p className="mt-0.5 text-base font-semibold text-emerald-400">
              ${costs.month.toFixed(4)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Agent Schedules</h2>
          {loading && schedules.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground/60">
              Loading schedules...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {(schedules as ScheduleConfig[]).map((config) => (
                <ScheduleCard key={config.agent_id} config={config} />
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Services</h2>
          <TelegramStatus />
        </div>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Run History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RunHistory runs={history as AutomationRun[]} />
        </CardContent>
      </Card>

      {/* Recent Activity Feed */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityFeed
            activities={activities as ActivityLogEntry[]}
            compact
            maxItems={20}
          />
        </CardContent>
      </Card>
    </div>
  );
}
