import type { GitHubProfile, GitHubRepo } from "@/types";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const USERNAME = "salahamassi";

function headers(): HeadersInit {
  const h: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "RepresentMe/1.0",
  };
  if (GITHUB_TOKEN) {
    h.Authorization = `Bearer ${GITHUB_TOKEN}`;
  }
  return h;
}

export async function fetchGitHubProfile(): Promise<GitHubProfile> {
  const res = await fetch(`https://api.github.com/users/${USERNAME}`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const data = await res.json();

  // Fetch repos for language stats (exclude archived)
  const allRepos = await fetchGitHubRepos();
  const repos = allRepos.filter((r) => !r.isArchived);
  const originalRepos = repos.filter((r) => !r.isFork);

  const langCount: Record<string, number> = {};
  repos.forEach((r) => {
    if (r.language) {
      langCount[r.language] = (langCount[r.language] || 0) + 1;
    }
  });

  const topLanguages = Object.entries(langCount)
    .sort(([, a], [, b]) => b - a)
    .map(([language, count]) => ({ language, count }));

  const totalStars = repos.reduce((sum, r) => sum + r.stars, 0);

  return {
    username: data.login,
    bio: data.bio || "",
    company: data.company || null,
    location: data.location || "",
    followers: data.followers,
    following: data.following,
    publicRepos: repos.length,
    totalStars,
    originalRepos: originalRepos.length,
    forkedRepos: repos.length - originalRepos.length,
    archivedRepos: allRepos.length - repos.length,
    topLanguages,
  };
}

export async function fetchGitHubRepos(): Promise<GitHubRepo[]> {
  const allRepos: GitHubRepo[] = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      `https://api.github.com/users/${USERNAME}/repos?per_page=100&page=${page}&sort=updated`,
      { headers: headers() }
    );
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

    const data = await res.json();
    if (data.length === 0) break;

    for (const repo of data) {
      allRepos.push({
        name: repo.name,
        description: repo.description || null,
        language: repo.language || null,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        isFork: repo.fork,
        hasReadme: true, // Assume true; checking README requires extra API call
        lastCommit: repo.pushed_at || repo.updated_at,
        topics: repo.topics || [],
        url: repo.html_url,
        isArchived: repo.archived,
      });
    }

    if (data.length < 100) break;
    page++;
  }

  return allRepos;
}

export async function getRecentActivity(): Promise<{
  newStars: number;
  recentCommits: number;
  highlights: string[];
}> {
  try {
    const repos = await fetchGitHubRepos();
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const totalStars = repos.reduce((s, r) => s + r.stars, 0);
    const recentlyUpdated = repos.filter(
      (r) => new Date(r.lastCommit) > oneWeekAgo
    );

    const highlights: string[] = [];

    if (recentlyUpdated.length > 0) {
      highlights.push(
        `${recentlyUpdated.length} repo${recentlyUpdated.length > 1 ? "s" : ""} updated this week`
      );
    }

    highlights.push(`Total stars: ${totalStars}`);
    highlights.push(`${repos.filter((r) => !r.isFork).length} original repos`);

    return {
      newStars: 0, // Would need to compare with previous data
      recentCommits: recentlyUpdated.length,
      highlights,
    };
  } catch (err) {
    return {
      newStars: 0,
      recentCommits: 0,
      highlights: [`Error fetching GitHub data: ${err}`],
    };
  }
}

// --- Issue Hunter API functions ---

export interface GitHubIssueResult {
  id: number;
  number: number;
  title: string;
  body: string;
  html_url: string;
  labels: { name: string }[];
  repository_url: string;
  state: string;
  created_at: string;
  comments: number;
  // Parsed from repository_url
  repoOwner: string;
  repoName: string;
}

export async function searchIssuesForSkills(
  languages: string[] = ["swift", "dart", "typescript", "kotlin"],
  labels: string[] = ["good first issue", "help wanted"]
): Promise<GitHubIssueResult[]> {
  const allIssues: GitHubIssueResult[] = [];

  for (const label of labels) {
    const langQuery = languages.map((l) => `language:${l}`).join("+");
    const q = encodeURIComponent(`label:"${label}" ${langQuery} state:open is:issue`);

    const res = await fetch(
      `https://api.github.com/search/issues?q=${q}&sort=created&order=desc&per_page=15`,
      { headers: headers() }
    );

    if (!res.ok) {
      console.error(`[GitHub] Search failed for "${label}": ${res.status}`);
      continue;
    }

    const data = await res.json();

    for (const item of data.items || []) {
      // Parse owner/repo from repository_url
      const repoUrl = item.repository_url as string;
      const parts = repoUrl.split("/");
      const repoOwner = parts[parts.length - 2];
      const repoName = parts[parts.length - 1];

      allIssues.push({
        id: item.id,
        number: item.number,
        title: item.title,
        body: (item.body || "").slice(0, 3000),
        html_url: item.html_url,
        labels: item.labels || [],
        repository_url: repoUrl,
        state: item.state,
        created_at: item.created_at,
        comments: item.comments,
        repoOwner,
        repoName,
      });
    }
  }

  // Deduplicate by issue URL
  const seen = new Set<string>();
  return allIssues.filter((i) => {
    if (seen.has(i.html_url)) return false;
    seen.add(i.html_url);
    return true;
  });
}

export async function fetchIssueDetails(
  owner: string,
  repo: string,
  issueNumber: number
): Promise<{ title: string; body: string; labels: string[]; state: string; comments: number }> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
    { headers: headers() }
  );
  if (!res.ok) throw new Error(`GitHub issue fetch failed: ${res.status}`);
  const data = await res.json();
  return {
    title: data.title,
    body: (data.body || "").slice(0, 3000),
    labels: (data.labels || []).map((l: { name: string }) => l.name),
    state: data.state,
    comments: data.comments,
  };
}

export async function fetchRepoReadme(owner: string, repo: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/readme`,
      { headers: headers() }
    );
    if (!res.ok) return "(No README found)";
    const data = await res.json();
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return content.slice(0, 2000);
  } catch {
    return "(README fetch failed)";
  }
}

export async function fetchRepoContents(
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<string> {
  try {
    const refParam = ref ? `?ref=${ref}` : "";
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}${refParam}`,
      { headers: headers() }
    );
    if (!res.ok) return "";
    const data = await res.json();
    if (data.content) {
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      // Truncate to ~200 lines
      const lines = content.split("\n");
      return lines.slice(0, 200).join("\n");
    }
    return "";
  } catch {
    return "";
  }
}

export async function fetchUserPRsInRepo(
  owner: string,
  repo: string
): Promise<{ number: number; title: string; state: string; merged: boolean; html_url: string; body: string }[]> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls?state=all&per_page=10`,
      { headers: headers() }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data
      .filter((pr: { user: { login: string } }) => pr.user.login === USERNAME)
      .map((pr: { number: number; title: string; state: string; merged_at: string | null; html_url: string; body: string }) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        merged: !!pr.merged_at,
        html_url: pr.html_url,
        body: (pr.body || "").slice(0, 500),
      }));
  } catch {
    return [];
  }
}

export async function fetchRepoTree(
  owner: string,
  repo: string,
  branch?: string
): Promise<{ path: string; type: string; size?: number }[]> {
  try {
    const ref = branch || "HEAD";
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`,
      { headers: headers() }
    );
    if (!res.ok) return [];
    const data = await res.json();

    const sourceExtensions = [".swift", ".dart", ".ts", ".tsx", ".kt", ".java", ".rb"];
    return (data.tree || [])
      .filter((item: { path: string; type: string }) => {
        if (item.type !== "blob") return false;
        return sourceExtensions.some((ext) => item.path.endsWith(ext));
      })
      .filter((item: { path: string }) => {
        // Exclude tests, configs, generated
        const p = item.path.toLowerCase();
        return !p.includes("test") && !p.includes("mock") && !p.includes("generated") && !p.includes("node_modules") && !p.includes(".build");
      })
      .slice(0, 50);
  } catch {
    return [];
  }
}

// --- Write operations (require token with public_repo scope) ---

export async function updateRepoDescription(
  repo: string,
  description: string
): Promise<boolean> {
  const res = await fetch(`https://api.github.com/repos/${USERNAME}/${repo}`, {
    method: "PATCH",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });
  return res.ok;
}

export async function updateRepoTopics(
  repo: string,
  topics: string[]
): Promise<boolean> {
  const res = await fetch(`https://api.github.com/repos/${USERNAME}/${repo}/topics`, {
    method: "PUT",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ names: topics }),
  });
  return res.ok;
}

export async function updateUserProfile(updates: {
  bio?: string;
  company?: string;
}): Promise<boolean> {
  const res = await fetch("https://api.github.com/user", {
    method: "PATCH",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  return res.ok;
}

export async function archiveRepo(repo: string): Promise<boolean> {
  const res = await fetch(`https://api.github.com/repos/${USERNAME}/${repo}`, {
    method: "PATCH",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ archived: true }),
  });
  return res.ok;
}
