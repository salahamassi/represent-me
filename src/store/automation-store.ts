"use client";

import { create } from "zustand";
import type { ScheduleConfig, AutomationRun } from "@/types";

interface AutomationStore {
  schedules: ScheduleConfig[];
  history: AutomationRun[];
  telegramConfigured: boolean;
  claudeConfigured: boolean;
  loading: boolean;
  runningAgent: string | null;

  fetchStatus: () => Promise<void>;
  fetchHistory: (agentId?: string) => Promise<void>;
  toggleSchedule: (agentId: string, enabled: boolean) => Promise<void>;
  triggerRun: (agentId: string) => Promise<{ success: boolean; message: string }>;
}

export const useAutomationStore = create<AutomationStore>((set) => ({
  schedules: [],
  history: [],
  telegramConfigured: false,
  claudeConfigured: false,
  loading: false,
  runningAgent: null,

  fetchStatus: async () => {
    set({ loading: true });
    try {
      const res = await fetch("/api/automation/status");
      const data = await res.json();
      set({
        schedules: data.schedules,
        telegramConfigured: data.telegram?.configured || false,
        claudeConfigured: data.claude?.configured || false,
      });
    } catch (err) {
      console.error("Failed to fetch automation status:", err);
    } finally {
      set({ loading: false });
    }
  },

  fetchHistory: async (agentId?: string) => {
    try {
      const url = agentId
        ? `/api/automation/history?agentId=${agentId}`
        : "/api/automation/history";
      const res = await fetch(url);
      const data = await res.json();
      set({ history: data });
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  },

  toggleSchedule: async (agentId: string, enabled: boolean) => {
    try {
      await fetch("/api/automation/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, enabled }),
      });
      // Re-fetch to get updated state
      const res = await fetch("/api/automation/status");
      const data = await res.json();
      set({ schedules: data.schedules });
    } catch (err) {
      console.error("Failed to toggle schedule:", err);
    }
  },

  triggerRun: async (agentId: string) => {
    set({ runningAgent: agentId });
    try {
      const res = await fetch("/api/automation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
      const data = await res.json();

      // Refresh history
      const histRes = await fetch("/api/automation/history");
      const history = await histRes.json();
      set({ history });

      return {
        success: data.success || false,
        message: data.message || data.error || "Unknown result",
      };
    } catch (err) {
      return { success: false, message: String(err) };
    } finally {
      set({ runningAgent: null });
    }
  },
}));
