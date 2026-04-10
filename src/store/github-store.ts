"use client";

import { create } from "zustand";
import type { GitHubProfile, GitHubRepo, OSSContribution, CodeGem, ActivityLogEntry } from "@/types";

interface RepoWithScore extends GitHubRepo {
  healthScore: number;
}

interface GitHubInsights {
  latestRun: {
    id: number;
    started_at: string;
    finished_at: string;
    findings_count: number;
    actions_count: number;
    total_cost: number;
    total_tokens: number;
    duration_seconds: number;
  } | null;
  activities: ActivityLogEntry[];
  contributions: OSSContribution[];
  gems: CodeGem[];
}

interface GitHubStore {
  // Data
  profile: GitHubProfile | null;
  repos: RepoWithScore[];
  insights: GitHubInsights | null;
  activities: ActivityLogEntry[];
  contributions: OSSContribution[];
  gems: CodeGem[];

  // UI state
  loading: { profile: boolean; repos: boolean; insights: boolean; readme: boolean; analysis: boolean };
  activeTab: string;
  expandedRepo: string | null;
  readmeModal: { open: boolean; repoName: string; readme: string; loading: boolean } | null;
  analysisResult: string | null;

  // Actions
  fetchProfile: () => Promise<void>;
  fetchRepos: () => Promise<void>;
  fetchInsights: () => Promise<void>;
  setActiveTab: (tab: string) => void;
  toggleRepoExpanded: (name: string) => void;
  generateReadme: (repoName: string) => Promise<void>;
  closeReadmeModal: () => void;
  runAnalysis: () => Promise<void>;
  triggerCodeGems: () => Promise<void>;
}

export const useGitHubStore = create<GitHubStore>((set, get) => ({
  profile: null,
  repos: [],
  insights: null,
  activities: [],
  contributions: [],
  gems: [],
  loading: { profile: false, repos: false, insights: false, readme: false, analysis: false },
  activeTab: "actions",
  expandedRepo: null,
  readmeModal: null,
  analysisResult: null,

  fetchProfile: async () => {
    set((s) => ({ loading: { ...s.loading, profile: true } }));
    try {
      const res = await fetch("/api/github/profile");
      if (res.ok) {
        const data = await res.json();
        set({ profile: data });
      }
    } catch (err) {
      console.error("Failed to fetch profile:", err);
    } finally {
      set((s) => ({ loading: { ...s.loading, profile: false } }));
    }
  },

  fetchRepos: async () => {
    set((s) => ({ loading: { ...s.loading, repos: true } }));
    try {
      const res = await fetch("/api/github/repos");
      if (res.ok) {
        const data = await res.json();
        set({ repos: data });
      }
    } catch (err) {
      console.error("Failed to fetch repos:", err);
    } finally {
      set((s) => ({ loading: { ...s.loading, repos: false } }));
    }
  },

  fetchInsights: async () => {
    set((s) => ({ loading: { ...s.loading, insights: true } }));
    try {
      const res = await fetch("/api/github/insights");
      if (res.ok) {
        const data = await res.json();
        set({
          insights: data,
          activities: data.activities || [],
          contributions: data.contributions || [],
          gems: data.gems || [],
        });
      }
    } catch (err) {
      console.error("Failed to fetch insights:", err);
    } finally {
      set((s) => ({ loading: { ...s.loading, insights: false } }));
    }
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleRepoExpanded: (name) => set((s) => ({ expandedRepo: s.expandedRepo === name ? null : name })),

  generateReadme: async (repoName: string) => {
    set({ readmeModal: { open: true, repoName, readme: "", loading: true } });
    try {
      const res = await fetch("/api/github/readme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoName }),
      });
      const data = await res.json();
      set({
        readmeModal: {
          open: true,
          repoName,
          readme: data.readme || data.error || "Failed to generate",
          loading: false,
        },
      });
    } catch (err) {
      set({
        readmeModal: {
          open: true,
          repoName,
          readme: `Error: ${err}`,
          loading: false,
        },
      });
    }
  },

  closeReadmeModal: () => set({ readmeModal: null }),

  runAnalysis: async () => {
    set((s) => ({ loading: { ...s.loading, analysis: true }, analysisResult: null }));
    try {
      const res = await fetch("/api/automation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: "github" }),
      });
      const data = await res.json();
      set({
        analysisResult: data.success
          ? `Analysis complete: ${data.findings} findings`
          : `Error: ${data.error}`,
      });
      // Refresh insights after analysis
      await get().fetchInsights();
    } catch (err) {
      set({ analysisResult: `Error: ${err}` });
    } finally {
      set((s) => ({ loading: { ...s.loading, analysis: false } }));
    }
  },

  triggerCodeGems: async () => {
    try {
      const res = await fetch("/api/automation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: "code-gems" }),
      });
      const data = await res.json();
      if (data.success) {
        await get().fetchInsights();
      }
    } catch (err) {
      console.error("Code gems trigger failed:", err);
    }
  },
}));
