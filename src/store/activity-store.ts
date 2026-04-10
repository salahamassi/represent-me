"use client";

import { create } from "zustand";
import type { ActivityLogEntry } from "@/types";

interface ActivityStore {
  activities: ActivityLogEntry[];
  costs: { today: number; week: number; month: number };
  loading: boolean;
  filter: { agentId?: string; eventType?: string };

  fetchActivities: (agentId?: string, runId?: number) => Promise<void>;
  setFilter: (filter: { agentId?: string; eventType?: string }) => void;
}

export const useActivityStore = create<ActivityStore>((set, get) => ({
  activities: [],
  costs: { today: 0, week: 0, month: 0 },
  loading: false,
  filter: {},

  fetchActivities: async (agentId?: string, runId?: number) => {
    set({ loading: true });
    try {
      const params = new URLSearchParams();
      params.set("limit", "200");
      if (agentId) params.set("agentId", agentId);
      if (runId) params.set("runId", String(runId));

      const res = await fetch(`/api/activity?${params}`);
      const data = await res.json();
      set({
        activities: data.activities || [],
        costs: data.costs || { today: 0, week: 0, month: 0 },
      });
    } catch (err) {
      console.error("Failed to fetch activities:", err);
    } finally {
      set({ loading: false });
    }
  },

  setFilter: (filter) => set({ filter }),
}));
