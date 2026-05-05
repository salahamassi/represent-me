"use client";

import { useAgentStore } from "@/store/agent-store";
import { FindingsList } from "@/components/agents/findings-list";
import { ActionItem } from "@/components/agents/action-item";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { profile } from "@/data/profile";
import { pubdevPackages } from "@/data/pubdev-data";
import {
  Play,
  ExternalLink,
  MapPin,
  Mail,
  Phone,
  Briefcase,
  GraduationCap,
  Package,
  Trophy,
  Sparkles,
  Code2,
  FileText,
  Download,
} from "lucide-react";

export default function ProfilePage() {
  const agent = useAgentStore((s) => s.agents.resume);
  const runAgent = useAgentStore((s) => s.runAgent);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your resume data and cross-platform consistency check
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {/* Two rows of export buttons:
               top  = Full CV (rich portfolio view, with avatar)
               bottom = ATS CV (trimmed, single-column, no avatar, safer for Workday/Greenhouse parsers). */}
          <div className="flex items-center gap-2">
            <span className="mr-1 text-[10px] uppercase tracking-wider text-muted-foreground">Full</span>
            <a
              href="/api/profile/export?format=pdf"
              download
              className="flex items-center gap-2 rounded-lg bg-emerald-600/15 border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-600/25 transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> PDF
            </a>
            <a
              href="/api/profile/export?format=docx"
              download
              className="flex items-center gap-2 rounded-lg bg-blue-600/15 border border-blue-500/30 px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-600/25 transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> DOCX
            </a>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="mr-1 text-[10px] uppercase tracking-wider text-muted-foreground"
              title="Trimmed 2-page CV, single-column, no avatar — safer for Workday/Greenhouse/Lever ATS parsers"
            >
              ATS
            </span>
            <a
              href="/api/profile/export?format=pdf&ats=true"
              download
              className="flex items-center gap-2 rounded-lg bg-amber-600/15 border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-600/25 transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> PDF
            </a>
            <a
              href="/api/profile/export?format=docx&ats=true"
              download
              className="flex items-center gap-2 rounded-lg bg-purple-600/15 border border-purple-500/30 px-3 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-600/25 transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> DOCX
            </a>
          </div>
          {agent.status !== "running" && (
            <button
              onClick={() => runAgent("resume")}
              className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              <Play className="h-4 w-4" /> {agent.status === "done" ? "Re-run" : "Run Agent"}
            </button>
          )}
        </div>
      </div>

      <Tabs defaultValue="resume">
        <TabsList>
          <TabsTrigger value="resume">Resume</TabsTrigger>
          <TabsTrigger value="packages">pub.dev Packages</TabsTrigger>
          <TabsTrigger value="consistency">Consistency Check</TabsTrigger>
          <TabsTrigger value="actions">Action Items</TabsTrigger>
        </TabsList>

        <TabsContent value="resume" className="mt-4 space-y-6">
          {/* Header */}
          <Card className="border-border bg-card">
            <CardContent className="p-6">
              <div className="flex flex-col gap-5 sm:flex-row">
                {profile.avatar && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatar}
                    alt={profile.name}
                    className="h-28 w-28 shrink-0 rounded-xl border border-border object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold text-foreground">{profile.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{profile.role}</p>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{profile.location}</span>
                    <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{profile.email}</span>
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{profile.phone}</span>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{profile.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {Object.entries(profile.links).map(([platform, url]) => (
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {platform}
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Key Achievements — surfaced only when the CV data has them. */}
          {profile.keyAchievements && profile.keyAchievements.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Trophy className="h-4 w-4" /> Key Achievements
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {profile.keyAchievements.map((a, i) => (
                    <div key={i} className="rounded-lg border border-border bg-background/50 p-4">
                      <h3 className="text-sm font-semibold text-foreground">{a.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* AI Integration Highlights — differentiator paragraphs from the CV. */}
          {profile.aiIntegrationHighlights && profile.aiIntegrationHighlights.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Sparkles className="h-4 w-4" /> AI Integration Highlights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {profile.aiIntegrationHighlights.map((h, i) => (
                    <li
                      key={i}
                      className="text-xs leading-relaxed text-muted-foreground before:mr-2 before:content-['▸']"
                    >
                      {h}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Experience */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Briefcase className="h-4 w-4" /> Experience
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {profile.experience.map((exp, i) => (
                <div key={i} className="relative border-l-2 border-zinc-800 pl-4">
                  <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-muted-foreground/40" />
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-foreground">{exp.title}</h3>
                    {/* Surface contract/freelance/part-time tags so WiNCHKSA's
                        long "Present" range reads correctly against other
                        overlapping roles. Full-time is implicit — no pill. */}
                    {exp.employmentType && exp.employmentType !== "full-time" && (
                      <Badge
                        variant="outline"
                        className="text-[10px] text-amber-300 bg-amber-500/10 border-amber-500/30"
                      >
                        {exp.employmentType}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{exp.company}</p>
                  <p className="text-xs text-muted-foreground/60">{exp.period} | {exp.location}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{exp.description}</p>
                  <ul className="mt-2 space-y-1">
                    {exp.highlights.map((h, j) => (
                      <li key={j} className="text-xs text-muted-foreground before:mr-2 before:content-['->']">
                        {h}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {exp.technologies.map((tech) => (
                      <Badge key={tech} variant="outline" className="text-[10px] text-muted-foreground">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Skills */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Skills</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {profile.skills.map((group) => (
                <div key={group.category}>
                  <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">{group.category}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map((skill) => (
                      <Badge key={skill} variant="outline" className="text-xs text-foreground">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Open Source & Creator */}
          {profile.openSource.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Code2 className="h-4 w-4" /> Open Source &amp; Creator
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-4">
                  {profile.openSource.map((os, i) => (
                    <li key={i} className="border-l-2 border-zinc-800 pl-4">
                      {os.url ? (
                        <a
                          href={os.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:text-blue-300"
                        >
                          {os.name}
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </a>
                      ) : (
                        <h3 className="text-sm font-medium text-foreground">{os.name}</h3>
                      )}
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{os.description}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Publications */}
          {profile.publications.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <FileText className="h-4 w-4" /> Publications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {profile.publications.map((pub, i) => (
                    <li
                      key={i}
                      className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground"
                    >
                      {pub.url ? (
                        <a
                          href={pub.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-foreground hover:text-blue-300"
                        >
                          {pub.title}
                        </a>
                      ) : (
                        <span className="font-medium text-foreground">{pub.title}</span>
                      )}
                      <span className="text-muted-foreground/60">·</span>
                      <span>{pub.platform}</span>
                      {pub.date && (
                        <>
                          <span className="text-muted-foreground/60">·</span>
                          <span>{pub.date}</span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Education */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <GraduationCap className="h-4 w-4" /> Education
              </CardTitle>
            </CardHeader>
            <CardContent>
              {profile.education.map((edu, i) => (
                <div key={i}>
                  <h3 className="font-medium text-foreground">{edu.degree}</h3>
                  <p className="text-sm text-muted-foreground">{edu.institution}</p>
                  <p className="text-xs text-muted-foreground/60">{edu.period}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packages" className="mt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {pubdevPackages.map((pkg) => (
              <Card key={pkg.name} className="border-border bg-card">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-blue-400" />
                      <h3 className="font-semibold text-foreground">{pkg.name}</h3>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      v{pkg.version}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{pkg.description}</p>
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{pkg.pubPoints} pub points</span>
                    <span>{pkg.likes} likes</span>
                  </div>
                  <a
                    href={pkg.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                  >
                    <ExternalLink className="h-3 w-3" /> View on pub.dev
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="consistency" className="mt-4">
          <FindingsList findings={agent.findings} />
        </TabsContent>

        <TabsContent value="actions" className="mt-4 space-y-2">
          {agent.actionItems.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground/60">
              Run the agent to see action items
            </div>
          ) : (
            agent.actionItems.map((item) => <ActionItem key={item.id} item={item} />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
