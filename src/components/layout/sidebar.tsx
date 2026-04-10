"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Code,
  Globe,
  Target,
  PenTool,
  User,
  Zap,
  Activity,
  Bug,
  Terminal,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/store/agent-store";
import type { AgentId } from "@/types";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, agentId: null },
  { href: "/github", label: "GitHub", icon: Code, agentId: "github" as AgentId },
  { href: "/linkedin", label: "LinkedIn", icon: Globe, agentId: "linkedin" as AgentId },
  { href: "/jobs", label: "Job Match", icon: Target, agentId: "job-matcher" as AgentId },
  { href: "/content", label: "Content", icon: PenTool, agentId: "content" as AgentId },
  { href: "/profile", label: "Profile", icon: User, agentId: "resume" as AgentId },
  { href: "/issues", label: "Issues", icon: Bug, agentId: null },
  { href: "/automation", label: "Automation", icon: Zap, agentId: null },
  { href: "/activity", label: "Activity", icon: Activity, agentId: null },
];

const STATUS_COLORS = {
  idle: "bg-muted-foreground/40",
  running: "bg-blue-400 animate-pulse",
  done: "bg-emerald-400",
  error: "bg-red-400",
};

export function Sidebar() {
  const pathname = usePathname();
  const agents = useAgentStore((s) => s.agents);
  const runAllAgents = useAgentStore((s) => s.runAllAgents);
  const isAnyRunning = Object.values(agents).some((a) => a.status === "running");

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[260px] flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 border-b border-border px-5 py-5">
        <Terminal className="h-5 w-5 text-emerald-400" />
        <span className="text-lg font-semibold tracking-tight">Represent Me</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const agentStatus = item.agentId ? agents[item.agentId]?.status : null;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {agentStatus && (
                <span
                  className={cn("h-2 w-2 rounded-full", STATUS_COLORS[agentStatus])}
                />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <button
          onClick={() => runAllAgents()}
          disabled={isAnyRunning}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
            isAnyRunning
              ? "cursor-not-allowed bg-muted text-muted-foreground"
              : "bg-emerald-600 text-white hover:bg-emerald-500"
          )}
        >
          <Play className="h-4 w-4" />
          {isAnyRunning ? "Running..." : "Run All Agents"}
        </button>
      </div>
    </aside>
  );
}
