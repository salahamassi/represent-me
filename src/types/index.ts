export type AgentId = "github" | "linkedin" | "resume" | "job-matcher" | "content";

export type AgentStatus = "idle" | "running" | "done" | "error";

export type Severity = "critical" | "warning" | "info" | "positive";

export type Priority = "high" | "medium" | "low";

export type Effort = "quick" | "moderate" | "significant";

export interface Finding {
  id: string;
  agentId: AgentId;
  severity: Severity;
  title: string;
  description: string;
  category: string;
  evidence?: string;
}

export interface ActionItem {
  id: string;
  agentId: AgentId;
  priority: Priority;
  effort: Effort;
  title: string;
  description: string;
  completed: boolean;
  link?: string;
}

export interface AgentDefinition {
  id: AgentId;
  name: string;
  description: string;
  icon: string;
}

export interface AgentState extends AgentDefinition {
  status: AgentStatus;
  lastRunAt: Date | null;
  findings: Finding[];
  actionItems: ActionItem[];
}

export interface PresenceScore {
  overall: number;
  github: number;
  linkedin: number;
  content: number;
  consistency: number;
  jobReadiness: number;
}

export interface AgentResult {
  findings: Finding[];
  actionItems: ActionItem[];
}

// Profile types
export interface Experience {
  title: string;
  company: string;
  period: string;
  location: string;
  description: string;
  highlights: string[];
  technologies: string[];
}

export interface Education {
  degree: string;
  institution: string;
  period: string;
}

export interface OpenSourceContribution {
  name: string;
  description: string;
  url?: string;
}

export interface Publication {
  title: string;
  platform: string;
  url?: string;
  date?: string;
}

export interface ProfileData {
  name: string;
  role: string;
  location: string;
  email: string;
  phone: string;
  summary: string;
  links: {
    github: string;
    linkedin: string;
    medium: string;
    devto: string;
    stackoverflow: string;
    pubdev: string;
  };
  experience: Experience[];
  education: Education[];
  skills: { category: string; items: string[] }[];
  openSource: OpenSourceContribution[];
  publications: Publication[];
}

// GitHub data types
export interface GitHubProfile {
  username: string;
  bio: string;
  company: string | null;
  location: string;
  followers: number;
  following: number;
  publicRepos: number;
  totalStars: number;
  originalRepos: number;
  forkedRepos: number;
  archivedRepos: number;
  topLanguages: { language: string; count: number }[];
}

export interface GitHubRepo {
  name: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  isFork: boolean;
  hasReadme: boolean;
  lastCommit: string;
  topics: string[];
  url: string;
  isArchived: boolean;
}

// Medium/DevTo article types
export interface Article {
  title: string;
  url: string;
  publishDate: string;
  tags: string[];
  readTime: string;
  platform: "medium" | "devto";
}

// pub.dev package types
export interface PubDevPackage {
  name: string;
  version: string;
  pubPoints: number;
  likes: number;
  description: string;
  url: string;
}

// Job template types
export interface JobTemplate {
  id: string;
  title: string;
  company: string;
  companyType: string;
  location: string;
  remote: boolean;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  experienceYears: number;
  description: string;
  url?: string;
}

export interface JobMatch extends JobTemplate {
  fitPercentage: number;
  matchedSkills: string[];
  missingSkills: string[];
  matchedNiceToHave: string[];
}

// Automation types
export interface ScheduleConfig {
  agent_id: string;
  cron_expression: string;
  enabled: number;
  last_run_at: string | null;
  next_run_at: string | null;
}

export interface AutomationRun {
  id: number;
  agent_id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "error";
  findings_count: number;
  actions_count: number;
  error_message: string | null;
  notified: number;
}

export interface GeneratedContent {
  id: number;
  suggestion_id: string | null;
  content_type: string;
  generated_text: string;
  created_at: string;
  user_action: string | null;
}

export interface SeenJob {
  id: string;
  source: string;
  title: string;
  company: string | null;
  url: string | null;
  fit_percentage: number | null;
  matched_skills: string | null;
  missing_skills: string | null;
  first_seen_at: string;
  user_action: string | null;
}

// OSS Contribution types
export interface OSSContribution {
  id: number;
  github_issue_url: string;
  repo_owner: string;
  repo_name: string;
  issue_number: number;
  issue_title: string;
  issue_labels: string | null;
  language: string | null;
  status: "found" | "analyzing" | "notified" | "working" | "pr_opened" | "pr_merged" | "dismissed";
  ai_analysis: string | null;
  pr_url: string | null;
  pr_number: number | null;
  found_at: string;
  notified_at: string | null;
  pr_opened_at: string | null;
  pr_merged_at: string | null;
  content_generated: number;
  user_action: string | null;
}

export interface CodeGem {
  id: number;
  repo_name: string;
  file_path: string | null;
  gem_type: "pattern" | "architecture" | "trick" | "optimization";
  title: string;
  description: string;
  code_snippet: string | null;
  ai_analysis: string | null;
  content_id: number | null;
  status: string;
  found_at: string;
}

// Activity log types
export interface ActivityLogEntry {
  id: number;
  run_id: number | null;
  agent_id: string;
  event_type: "fetch" | "analyze" | "generate" | "notify" | "error" | "bus_event";
  title: string;
  detail: string | null;
  tokens_used: number | null;
  cost_usd: number | null;
  duration_ms: number | null;
  created_at: string;
}

export interface EnhancedAutomationRun extends AutomationRun {
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  duration_seconds: number | null;
}

// Content suggestion types
export interface ArticleSuggestion {
  id: string;
  title: string;
  targetPlatform: "medium" | "devto" | "linkedin";
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedReadTime: string;
  tags: string[];
  outline: string[];
  rationale: string;
}
