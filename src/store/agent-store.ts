"use client";

import { create } from "zustand";
import type { AgentId, AgentState, PresenceScore, Finding, ActionItem } from "@/types";
import { AGENTS } from "@/lib/constants";
import { calculatePresenceScore } from "@/agents/scoring";

interface AgentStore {
  agents: Record<AgentId, AgentState>;
  presenceScore: PresenceScore;
  runAgent: (id: AgentId) => Promise<void>;
  runAllAgents: () => Promise<void>;
  resetAgent: (id: AgentId) => void;
  toggleActionItem: (agentId: AgentId, actionId: string) => void;
  getAllFindings: () => Finding[];
  getAllActionItems: () => ActionItem[];
}

function createInitialAgents(): Record<AgentId, AgentState> {
  const agents = {} as Record<AgentId, AgentState>;
  AGENTS.forEach((def) => {
    agents[def.id] = {
      ...def,
      status: "idle",
      lastRunAt: null,
      findings: [],
      actionItems: [],
    };
  });
  return agents;
}

const initialScore: PresenceScore = {
  overall: 0,
  github: 0,
  linkedin: 0,
  content: 0,
  consistency: 0,
  jobReadiness: 0,
};

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: createInitialAgents(),
  presenceScore: initialScore,

  runAgent: async (id: AgentId) => {
    set((state) => ({
      agents: {
        ...state.agents,
        [id]: { ...state.agents[id], status: "running" },
      },
    }));

    try {
      const agentModules: Record<AgentId, () => Promise<{ run: () => Promise<{ findings: Finding[]; actionItems: ActionItem[] }> }>> = {
        github: () => import("@/agents/github-agent"),
        linkedin: () => import("@/agents/linkedin-agent"),
        resume: () => import("@/agents/resume-agent"),
        "job-matcher": () => import("@/agents/job-matcher-agent"),
        content: () => import("@/agents/content-agent"),
      };

      const mod = await agentModules[id]();
      const result = await mod.run();

      set((state) => {
        const newAgents = {
          ...state.agents,
          [id]: {
            ...state.agents[id],
            status: "done" as const,
            lastRunAt: new Date(),
            findings: result.findings,
            actionItems: result.actionItems,
          },
        };

        const allFindings = Object.values(newAgents).flatMap((a) => a.findings);
        const presenceScore = allFindings.length > 0
          ? calculatePresenceScore(allFindings)
          : initialScore;

        return { agents: newAgents, presenceScore };
      });
    } catch {
      set((state) => ({
        agents: {
          ...state.agents,
          [id]: { ...state.agents[id], status: "error" },
        },
      }));
    }
  },

  runAllAgents: async () => {
    const agentIds: AgentId[] = ["github", "linkedin", "resume", "job-matcher", "content"];
    for (const id of agentIds) {
      await get().runAgent(id);
    }
  },

  resetAgent: (id: AgentId) => {
    set((state) => ({
      agents: {
        ...state.agents,
        [id]: {
          ...state.agents[id],
          status: "idle",
          lastRunAt: null,
          findings: [],
          actionItems: [],
        },
      },
    }));
  },

  toggleActionItem: (agentId: AgentId, actionId: string) => {
    set((state) => ({
      agents: {
        ...state.agents,
        [agentId]: {
          ...state.agents[agentId],
          actionItems: state.agents[agentId].actionItems.map((item) =>
            item.id === actionId ? { ...item, completed: !item.completed } : item
          ),
        },
      },
    }));
  },

  getAllFindings: () => {
    return Object.values(get().agents).flatMap((a) => a.findings);
  },

  getAllActionItems: () => {
    return Object.values(get().agents).flatMap((a) => a.actionItems);
  },
}));
