"use client";

import { useAgentStore } from "@/store/agent-store";
import { FindingsList } from "@/components/agents/findings-list";
import { ActionItem } from "@/components/agents/action-item";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { profile } from "@/data/profile";
import { pubdevPackages } from "@/data/pubdev-data";
import { Play, ExternalLink, MapPin, Mail, Phone, Briefcase, GraduationCap, Package } from "lucide-react";

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
        {agent.status !== "running" && (
          <button
            onClick={() => runAgent("resume")}
            className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            <Play className="h-4 w-4" /> {agent.status === "done" ? "Re-run" : "Run Agent"}
          </button>
        )}
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
              <h2 className="text-xl font-bold text-foreground">{profile.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{profile.role}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{profile.location}</span>
                <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{profile.email}</span>
                <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{profile.phone}</span>
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
                  <h3 className="font-medium text-foreground">{exp.title}</h3>
                  <p className="text-sm text-muted-foreground">{exp.company}</p>
                  <p className="text-xs text-muted-foreground/60">{exp.period} | {exp.location}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{exp.description}</p>
                  <ul className="mt-2 space-y-1">
                    {exp.highlights.slice(0, 4).map((h, j) => (
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
