#!/usr/bin/env tsx
/**
 * Renders the Air Apps Senior iOS Engineer resume — V3.
 *
 * Identical to render-jpmorgan-v2.ts except for 5 surgical ATS-keyword
 * insertions and a renamed PDF output. No content rewrites.
 *
 * Usage:
 *   npx tsx scripts/render-airapps.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { profile } from "../src/data/profile";
import {
  ResumeGenerationSchema,
  type ResumeGeneration,
} from "../src/agents/schemas/resume-gen.schema";

const JOB_TITLE = "Senior iOS Engineer";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const resume: ResumeGeneration = {
  // Edit 1: "scalable" inserted before "production".
  summary:
    "Senior iOS Engineer with 7+ years architecting scalable production Swift applications across telecom, logistics, and enterprise platforms. Authored AppRouter-UIKit (24 XCTest cases, 17 releases) — a Coordinator-style navigation framework — and achieved 90% order flow stability through 47 XCTest files. Experienced with Combine alongside Swift async/await for reactive data flows, MVVM + Coordinator architecture, and Agile squads with bi-weekly releases.",
  targetRole: "Senior iOS Engineer",
  experienceEntries: [
    {
      company: "WiNCHKSA",
      title: "iOS Engineer",
      period: "12/2019 - Present",
      bullets: [
        // Edit 2: "Optimized iOS app performance with..." + "performance profiling".
        "Optimized iOS app performance with 90% order flow stability through 47 XCTest files covering state machine exhaustive coverage, memory leak detection, and performance profiling",
        "Shipped real-time order tracking to App Store used by thousands of users daily — applied Apple Human Interface Guidelines and threading best practices",
        "Created WinchCore shared module powering Client, Provider, Owner variants — multi-module architecture consolidating UI components and business logic",
        "Authored AppRouter-UIKit open-source framework with 24 XCTest cases covering all 4 navigation types and 17 releases maintained",
        "Migrated codebase to Swift async/await, integrated SwiftUI with UIKit interoperability, and applied Combine alongside async/await for reactive data flows",
        "Integrated Firebase Crashlytics for production monitoring and alerting on iOS release builds",
        // Edit 3: "Agile Kanban squads".
        "Worked in Agile Kanban squads with bi-weekly releases — trunk-based development, Code Magic CI/CD running automated tests on every commit",
      ],
      technologies: ["Swift", "UIKit", "SwiftUI", "Combine", "async/await", "XCTest", "Code Magic"],
      employmentType: "contract",
    },
    {
      company: "Nologystore W.L.L",
      title: "Senior Mobile Developer",
      period: "02/2025 - 12/2025",
      bullets: [
        "Built fully custom Firebase In-App Messaging experience using SwiftUI for native iOS integration",
        "Improved system efficiency by 30% replacing deprecated MongoDB GraphQL integrations with RESTful APIs",
        "Led complete mobile app rebuild in Flutter for major relaunch focusing on codebase quality",
      ],
      technologies: ["SwiftUI", "Swift", "Firebase", "REST APIs", "Flutter", "GraphQL"],
    },
    {
      company: "Trivia",
      title: "Senior Mobile Engineer",
      period: "01/2026 - 04/2026",
      bullets: [
        "Architected cross-platform competitive trivia app structure before onboarding junior developers",
        "Designed core state layer with RemoteCubit hierarchy reducing API screens to single api() override",
        "Configured GitHub Actions CI/CD running golden tests on every PR with Codecov coverage reporting",
      ],
      technologies: ["Flutter", "BLoC", "GitHub Actions", "Firebase", "GoRouter"],
    },
    {
      company: "BIM Ventures",
      title: "React Native Developer",
      period: "06/2024 - 02/2025",
      bullets: [
        "Adapted to React Native from Flutter/iOS background, refactoring fragile TypeScript form logic to type-safe Zod + React Hook Form schemas",
        "Configured EAS CI/CD with EAS Update for instant hotfixes bypassing app store approval cycles",
      ],
      technologies: ["React Native", "TypeScript", "Expo", "Zod", "EAS"],
    },
    {
      company: "ITG Software",
      title: "iOS Developer",
      period: "06/2021 - 12/2021",
      bullets: [
        "Shipped Hesabi to iOS App Store — official self-service app for Jawwal telecom serving thousands of daily users",
        "Implemented mobile application security: Keychain-backed (Security framework) refresh tokens with biometric authentication regenerating every 5 minutes",
        "Built real-time identity verification using ID and face capture for SIM card activation",
        "Delivered multi-theme UI system with 10+ unique themes customized by user type",
      ],
      technologies: ["Swift", "UIKit", "Keychain", "Security", "Face ID", "App Store"],
    },
    {
      company: "One Studio",
      title: "VP of Innovation & Mobile Team Lead",
      period: "08/2022 - 06/2024",
      bullets: [
        "Founded Flutter Bond open-source framework with 100+ GitHub stars and 145+ tests across cache, network, form packages",
        "Set iOS architectural standards and code review baselines adopted across portfolio teams",
        "Mentored developers and facilitated cross-functional collaboration between design, product, and tech teams",
      ],
      technologies: ["Flutter", "Swift", "Firebase", "Mixpanel"],
    },
    {
      company: "Famcare",
      title: "Senior Flutter Developer to Mobile Team Lead",
      period: "12/2021 - 08/2022",
      bullets: [
        "Promoted to Mobile Team Lead after 2 months taking ownership of Flutter delivery",
        "Shipped Famcare to iOS App Store and Google Play with Code Magic CI/CD automated release builds",
        "Integrated Agora SDK for HD voice and video therapy sessions supporting 1:1 and group call modes",
      ],
      technologies: ["Flutter", "Agora SDK", "Firebase", "Code Magic"],
    },
  ],
  skillsGrouped: [
    {
      category: "iOS Development",
      // Edit 4: "iOS SDK" inserted after "Objective-C".
      items: ["Swift (object-oriented programming)", "Objective-C", "iOS SDK", "UIKit", "SwiftUI", "Combine", "Foundation", "Security", "Xcode", "iOS App Store"],
    },
    {
      category: "Testing & Quality",
      // Edit 5: "XCTest" → "Automated Testing (XCTest)".
      items: ["Automated Testing (XCTest)", "Unit Testing", "Memory Leak Detection", "Golden Tests", "TDD"],
    },
    {
      category: "Architecture",
      items: ["Clean Architecture", "MVVM + Coordinator", "Protocol-Oriented Programming", "Dependency Injection", "Modularization", "SOLID"],
    },
    {
      category: "CI/CD & Tools",
      items: ["GitHub Actions", "Code Magic", "Bitrise", "Fastlane", "Git flow", "Trunk-Based Development"],
    },
    {
      category: "Backend Integration",
      items: ["REST APIs", "Firebase", "GraphQL", "HTTP/HTTPS"],
    },
    {
      category: "Cross-Platform",
      items: ["Flutter", "React Native", "TypeScript"],
    },
  ],
  highlightedProjects: [
    {
      name: "AppRouter-UIKit",
      description:
        "Lightweight open-source navigation framework for UIKit-based iOS apps with 24 XCTest cases covering all 4 navigation types, duplicate prevention, and memory leak detection. 17 releases maintained.",
      url: "https://github.com/salahamassi/AppRouter-UIKit",
    },
    {
      name: "PrayersTimes",
      description:
        "Swift iOS reference project showcasing TDD and Clean Architecture with separated domain/data/presentation layers and full unit-test coverage — demonstrates disciplined, test-first iOS development.",
      url: "https://github.com/salahamassi/PrayersTimes",
    },
    {
      name: "SwifterSwift Contribution",
      description:
        "Contributed Stackview/swap helper to the widely-used SwifterSwift library, demonstrating iOS community engagement and code quality standards.",
      url: "https://github.com/SwifterSwift/SwifterSwift/pull/989",
    },
    {
      name: "share_plus Bug Fix",
      description:
        "Fixed Objective-C bug in plus_plugins package where 'share text' wasn't shown when sharing files — merged PR improving Flutter-iOS interoperability.",
      url: "https://github.com/fluttercommunity/plus_plugins/pull/907",
    },
  ],
  publications: [
    {
      title: "Swift Protocol Magic: Building a Beautiful, Reusable Option Selection System",
      url: "https://medium.com/@salahamassi/swift-protocol-magic-building-a-beautiful-reusable-option-selection-system-bcb76adead7c",
      date: "2025-03-30",
    },
    {
      title: "A Start-up's Guide to the iOS User Notifications Framework",
      url: "https://medium.com/@salahamassi/a-start-ups-guide-to-the-ios-user-notifications-framework-68d52de00ef8",
      date: "2023-08-17",
    },
    {
      title: "Power of the Swift Extensions with Type Constraints",
      url: "https://medium.com/@salahamassi/power-of-the-swift-extensions-with-type-constraints-97b1c8a4536e",
      date: "2022-12-10",
    },
    {
      title: "Present and Dismiss View Controller with Simple and Pretty Transition Animation",
      url: "https://medium.com/@salahamassi/present-and-dismiss-view-controller-with-simple-and-pretty-transition-animation-7fa42ddbda5f",
      date: "2019-05-17",
    },
  ],
  education: [
    {
      degree: "Bachelor's Degree, Computer Science",
      institution: "Islamic University of Gaza",
      period: "2014-2018",
    },
  ],
};

const validated = ResumeGenerationSchema.parse(resume);

function renderPdf(outputPdfPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmpJson = path.join(os.tmpdir(), `airapps-${Date.now()}.json`);
    fs.writeFileSync(
      tmpJson,
      JSON.stringify({ resume: validated, profile, jobTitle: JOB_TITLE })
    );
    const scriptPath = path.join(PROJECT_ROOT, "scripts", "generate-pdf.js");
    const child = spawn("node", [scriptPath, outputPdfPath, tmpJson], {
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("error", reject);
    child.on("exit", (code) => {
      try {
        fs.unlinkSync(tmpJson);
      } catch {
        /* ignore */
      }
      if (code === 0) resolve();
      else
        reject(
          new Error(`generate-pdf.js exited ${code}: ${stderr || "(no stderr)"}`)
        );
    });
  });
}

async function main() {
  const outDir = path.join(PROJECT_ROOT, "data", "resumes");
  fs.mkdirSync(outDir, { recursive: true });

  const resumeDump = path.join(
    os.tmpdir(),
    `Salah_Nahed_iOS_Engineer_CV_AirApps-resume.json`
  );
  fs.writeFileSync(resumeDump, JSON.stringify(validated, null, 2));

  const pdfPath = path.join(outDir, "Salah_Nahed_iOS_Engineer_CV_AirApps.pdf");
  await renderPdf(pdfPath);
  const sizeKb = (fs.statSync(pdfPath).size / 1024).toFixed(1);

  console.log("=== DONE ===");
  console.log(`Resume JSON:    ${resumeDump}`);
  console.log(`PDF:            ${pdfPath} (${sizeKb} KB)`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
