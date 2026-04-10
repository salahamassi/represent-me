import type { AgentDefinition, Severity, Priority, Effort } from "@/types";

export const AGENTS: AgentDefinition[] = [
  {
    id: "github",
    name: "GitHub Agent",
    description: "Audits your GitHub profile, repos, and contribution patterns",
    icon: "Github",
  },
  {
    id: "linkedin",
    name: "LinkedIn Agent",
    description: "Optimizes your LinkedIn presence with keyword analysis",
    icon: "Linkedin",  // maps to Globe in agent-card
  },
  {
    id: "resume",
    name: "Resume Agent",
    description: "Cross-checks consistency across all your platforms",
    icon: "FileText",
  },
  {
    id: "job-matcher",
    name: "Job Matcher",
    description: "Finds roles that match your profile and identifies gaps",
    icon: "Target",
  },
  {
    id: "content",
    name: "Content Agent",
    description: "Suggests articles and posts to boost your visibility",
    icon: "PenTool",
  },
];

export const SCORE_WEIGHTS = {
  github: 0.3,
  linkedin: 0.2,
  content: 0.2,
  consistency: 0.15,
  jobReadiness: 0.15,
};

export const SEVERITY_CONFIG: Record<
  Severity,
  { label: string; color: string; bg: string; border: string }
> = {
  critical: {
    label: "Critical",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  },
  warning: {
    label: "Warning",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  info: {
    label: "Info",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  positive: {
    label: "Positive",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
};

export const PRIORITY_CONFIG: Record<Priority, { label: string; color: string }> = {
  high: { label: "High", color: "text-red-400" },
  medium: { label: "Medium", color: "text-amber-400" },
  low: { label: "Low", color: "text-blue-400" },
};

export const EFFORT_CONFIG: Record<Effort, { label: string; color: string }> = {
  quick: { label: "Quick Win", color: "text-emerald-400" },
  moderate: { label: "Moderate", color: "text-amber-400" },
  significant: { label: "Significant", color: "text-red-400" },
};

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/github", label: "GitHub", icon: "Github" },
  { href: "/linkedin", label: "LinkedIn", icon: "Linkedin" },
  { href: "/jobs", label: "Job Match", icon: "Target" },
  { href: "/content", label: "Content", icon: "PenTool" },
  { href: "/profile", label: "Profile", icon: "User" },
];

export function getScoreColor(score: number): string {
  if (score <= 30) return "text-red-400";
  if (score <= 60) return "text-amber-400";
  if (score <= 80) return "text-blue-400";
  return "text-emerald-400";
}

export function getScoreStroke(score: number): string {
  if (score <= 30) return "#f87171";
  if (score <= 60) return "#fbbf24";
  if (score <= 80) return "#60a5fa";
  return "#34d399";
}
