@AGENTS.md

# Represent Me — Project Context

## Overview

A full-stack, event-driven platform built with Next.js 16 that orchestrates five specialized AI agents to automate career development workflows — from GitHub profile optimization and job matching to content generation and open-source contribution discovery. All agents are powered by Claude (Anthropic) with structured outputs, cost tracking, and real-time Telegram notifications.

## System Architecture

- Event-driven multi-agent system with a publish/subscribe communication bus enabling inter-agent collaboration (e.g., a merged PR automatically triggers content generation)
- SQLite persistence across 11 tables tracking jobs, contributions, content, activity logs, code gems, and resumes
- Scheduled automation via node-cron with 8 background tasks running at configurable intervals
- 36 routes (20 API + 16 pages) built on Next.js App Router
- Real-time state management with Zustand, live-synced to SQLite

## Agents

**GitHub Agent** — Analyzes GitHub profile via live API data, identifies improvement opportunities, and executes fixes (repo descriptions, topics, README generation, CI/CD repairs, fork archival) through a review/approval workflow. Includes an Issue Hunter that matches open-source issues to the user's skill set and delivers them via Telegram, plus a PR Tracker that monitors the full contribution lifecycle.

**Job Matcher Agent** — Scans multiple sources (RemoteOK, Arc.dev) and accepts manual job entries from any platform. Claude evaluates each role against the candidate profile, scoring fit percentage, transferable skills, and salary estimates. Generates tailored application kits (cover letters, resume sections) and includes an ATS scanner that analyzes uploaded PDF resumes against job-specific keywords.

**Resume Agent** — Generates tailored PDF resumes using pdf-lib (overlaying content on the original resume design) and DOCX via docx-js. Listens for high-fit job matches (85%+) and auto-generates targeted resumes.

**Content Agent** — Mines code gems from repositories and generates platform-specific content (LinkedIn posts, Medium articles, Dev.to drafts). Auto-triggers a full content suite when a PR is merged. All output goes through an approve/reject workflow before publishing.

**LinkedIn Agent** — Ingests exported LinkedIn data to score profile completeness across headline, summary, recommendations, network composition, and activity. Provides actionable optimization recommendations.

## Key Technical Details

- Claude API integration with Zod-validated structured outputs, retry logic, and per-call cost tracking
- GitHub API integration spanning 15+ endpoints with both read and write operations
- Telegram Bot API with inline keyboards, document uploads, and callback handling
- PDF manipulation preserving original resume design via coordinate-based text overlay
- Comprehensive activity logging with estimated cost per agent operation

## Tech Stack

Next.js 16 · TypeScript · Tailwind CSS · shadcn/ui · Zustand · SQLite · Claude API · GitHub API · Telegram Bot API · pdf-lib · pdfkit · docx-js · node-cron · Zod

## Metrics

- ~$0.25 total AI cost across all development operations
- 8 scheduled background tasks
- 11 database tables
- 5 autonomous agents with inter-agent event triggers
