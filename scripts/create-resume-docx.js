const { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, TabStopType, TabStopPosition, LevelFormat, BorderStyle } = require("docx");
const fs = require("fs");

const outputPath = process.argv[2] || "resume.docx";
const jsonDataPath = process.argv[3];

// Read tailored data if provided
let tailoredData = {};
if (jsonDataPath && fs.existsSync(jsonDataPath)) {
  tailoredData = JSON.parse(fs.readFileSync(jsonDataPath, "utf-8"));
}

const tailoredSummary = tailoredData.summary || "Senior Flutter Developer with 5+ years of specialized Dart and Flutter expertise, creator of the open-source Flutter Bond framework (7 packages on pub.dev) powering scalable mobile architectures. Proven track record delivering cross-platform applications with 100,000+ downloads, reducing deployment time by 30%, and improving system stability by 90%. Experienced in AI-powered product development, having built intelligent agent systems and automated QA pipelines using Claude API. Former VP of Innovation leading mobile teams across a startup portfolio.";
const targetJob = tailoredData.jobTitle || "Senior Flutter Developer";
const targetCompany = tailoredData.company || "";

// Colors
const ACCENT = "16A34A";
const DARK = "1A1A2E";
const MUTED = "6B7280";

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 21, color: "333333" } },
    },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Calibri", color: ACCENT },
        paragraph: { spacing: { before: 300, after: 100 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 4 } }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Calibri", color: DARK },
        paragraph: { spacing: { before: 200, after: 60 }, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 540, hanging: 260 } } } }],
    }],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 }, // A4
        margin: { top: 720, right: 900, bottom: 720, left: 900 },
      },
    },
    children: [
      // === NAME ===
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new TextRun({ text: "SALAH NAHED", bold: true, size: 48, font: "Calibri", color: DARK })],
      }),

      // === HEADLINE (tailored) ===
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: `${targetJob}${targetCompany ? " | " + targetCompany : ""} | Flutter Bond Creator`, size: 24, font: "Calibri", color: ACCENT, italics: true })],
      }),

      // === CONTACT ===
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: "+201067332825 | salahnahed@icloud.com | Cairo, Egypt", size: 18, color: MUTED }),
          new TextRun({ text: "\ngithub.com/salahamassi | linkedin.com/in/salah-nahed-a73250135 | medium.com/@salahamassi", size: 18, color: MUTED, break: 1 })],
      }),

      // === SUMMARY (tailored for Flutter Developer at Digital Harbor) ===
      sectionTitle("SUMMARY"),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: tailoredSummary, size: 21 })],
      }),

      // === EXPERIENCE ===
      sectionTitle("EXPERIENCE"),

      // Nologystore
      jobHeader("Senior Mobile Developer (Flutter)", "Nologystore W.L.L", "02/2025 - Present", "Cairo, Egypt"),
      bullet("Refactored legacy Flutter and Dart codebase to enhance performance, readability, and long-term maintainability for a major app relaunch"),
      bullet("Improved system efficiency by 30% by migrating deprecated MongoDB GraphQL integrations to modern RESTful APIs using Flutter\u2019s http package"),
      bullet("Built a fully custom Firebase In-App Messaging experience using SwiftUI (iOS) and Kotlin Jetpack Compose (Android), demonstrating cross-platform expertise"),
      bullet("Collaborated with backend teams on API integration, participated in QA sprints, and resolved critical bugs ahead of production release"),
      bullet("Published technical article: Design-Driven Firebase in Flutter on Medium and Dev.to"),
      techLine("Flutter, Dart, REST APIs, Firebase, SwiftUI, Kotlin, MongoDB, GraphQL"),

      // Flutter Bond (Open Source)
      jobHeader("Creator & Lead Developer", "Flutter Bond (Open Source)", "02/2022 - Present", "pub.dev"),
      bullet("Created and maintain a comprehensive Flutter framework inspired by Laravel, with 7 published packages on pub.dev"),
      bullet("Bond Form: powerful form abstraction with built-in validation, dirty tracking, and dynamic logic injection"),
      bullet("Bond Cache: flexible caching layer supporting in-memory and local persistence strategies"),
      bullet("Bond Network: declarative networking with interceptors, status hooks, and modular request composition"),
      bullet("Bond Analytics: unified interface for Firebase, Appsflyer, and Mixpanel analytics providers"),
      bullet("Built CLI tools for scaffolding, configuration management, and rapid prototyping"),
      techLine("Flutter, Dart, Package Development, State Management, Clean Architecture"),

      // One Studio
      jobHeader("VP of Innovation & Mobile Team Lead", "One Studio", "12/2021 - 06/2024", "Gaza Strip"),
      bullet("Led mobile engineering teams across a startup portfolio, ensuring architectural consistency and code quality in Flutter and iOS projects"),
      bullet("Built AI-powered QA Agent for Trivia app \u2014 automated feature review, use case extraction, and test generation using Claude API"),
      bullet("Founded and led development of Flutter Bond framework, improving structure, modularity, and developer experience"),
      bullet("Guided martech infrastructure for Famcare, developing analytics stacks with Appsflyer, WebEngage, and Intercom"),
      bullet("Mentored developers and facilitated cross-functional collaboration between design, product, and engineering teams"),
      bullet("Authored technical content: Flutter Dio Interceptors + Unit Test and A Start-up\u2019s Guide to iOS User Notifications"),
      techLine("Flutter, Dart, Swift, Claude AI, Firebase, Appsflyer, WebEngage, Team Leadership"),

      // WINCH
      jobHeader("iOS App Developer", "WiNCHKSA", "12/2019 - Present", "Saudi Arabia"),
      bullet("Designed and shipped a real-time order tracking experience used by thousands of users daily on a high-traffic logistics platform"),
      bullet("Integrated Claude AI for intelligent order processing and customer support automation"),
      bullet("Increased system stability for order flow by 90% through comprehensive unit, snapshot, and end-to-end tests"),
      bullet("Created WinchCore, a shared module powering all app variants (Client, Provider, Owner) with consolidated UI and business logic"),
      bullet("Authored AppRouter-UIKit, an open-source navigation framework extracted from production routing challenges"),
      bullet("Migrated codebase to Swift async/await concurrency and implemented UIKit\u2013SwiftUI interoperability"),
      bullet("Applied robust Git-based CI/CD workflow with Code Magic: automated tests on commit, staging on merge, production on tag"),
      techLine("Swift, UIKit, SwiftUI, Claude AI, async/await, Protocol-Oriented Programming, Code Magic"),

      // BIM Ventures
      jobHeader("React Native Developer", "BIM Ventures", "06/2024 - 02/2025", "Cairo, Egypt"),
      bullet("Modernized a React Native app, refactoring legacy code and improving component structure aligned with new REST API layer"),
      bullet("Replaced fragile form logic with type-safe schemas using Zod + React Hook Form, reducing runtime form bugs"),
      bullet("Applied automated CI/CD pipelines with Expo Application Services (EAS) for Android and iOS builds"),
      bullet("Leveraged EAS Update for instant hotfix delivery, bypassing traditional app store approval cycles"),
      techLine("React Native, TypeScript, Expo, Zod, React Hook Form, EAS, CI/CD"),

      // ITG
      jobHeader("Senior iOS Developer", "ITG Software, Inc.", "06/2021 - 12/2021", "Gaza Strip"),
      bullet("Led iOS development of Hesabi, the official self-service app for Jawwal (Palestine\u2019s largest telecom operator)"),
      bullet("Implemented remote identity verification using real-time ID and face capture for SIM card activation"),
      bullet("Built secure refresh token system using Keychain + biometric authentication (Face ID / Passcode)"),
      bullet("Delivered a multi-theme UI system with 10+ unique themes customized by user type"),
      techLine("Swift, UIKit, Keychain, Face ID, Telecom APIs, Agile"),

      // AI Projects
      jobHeader("AI Engineer (Part-time)", "Trivia App \u2014 devmatrash", "2024 - Present", "Remote"),
      bullet("Built AI-powered QA Agent that reviews features, extracts use cases, and generates test scenarios automatically using Claude API"),
      bullet("Designed agent architecture for automated feature analysis and quality assurance workflows"),
      techLine("Flutter, Dart, Claude AI / Anthropic API, AI Agents, Prompt Engineering"),

      jobHeader("Creator", "Represent Me \u2014 AI Agent Dashboard", "2026 - Present", "Cairo, Egypt"),
      bullet("Designed event-driven multi-agent architecture with 5 interconnected AI agents using Claude API"),
      bullet("Built automated pipeline: Job found \u2192 AI analyzes fit \u2192 Resume generated \u2192 Telegram notification"),
      bullet("Implemented Issue Hunter (OSS issue discovery), Code Gems miner, ATS Resume Scanner, and GitHub profile optimizer"),
      techLine("Next.js, TypeScript, Claude AI, AI Agent Architecture, SQLite, Telegram Bot API, Zod"),

      // === SKILLS ===
      sectionTitle("SKILLS"),
      skillLine("Flutter & Mobile", "Flutter, Dart, Swift, SwiftUI, UIKit, React Native, TypeScript, Kotlin, Jetpack Compose"),
      skillLine("AI & Automation", "Claude AI / Anthropic API, AI Agent Architecture, Prompt Engineering, LLM Integration"),
      skillLine("Architecture", "Clean Architecture, MVVM, Modular Architecture, Protocol-Oriented Programming, async/await"),
      skillLine("Backend & APIs", "REST APIs, GraphQL, Firebase, MongoDB"),
      skillLine("CI/CD & Tools", "Code Magic, EAS, Git, Fastlane, Unit Testing, Snapshot Testing, E2E Testing"),
      skillLine("Analytics", "Appsflyer, WebEngage, Intercom, Mixpanel, A/B Testing"),

      // === OPEN SOURCE ===
      sectionTitle("OPEN SOURCE CONTRIBUTIONS"),
      bullet("share_plus (Flutter): Fixed Objective-C bug in a widely used Flutter package"),
      bullet("Flutterfire CLI: Added flavor support, contributing to Flutter ecosystem tooling"),
      bullet("SwifterSwift: Contributed StackView/swap functionality (#989)"),
      bullet("Android FixDate EditText: Published UI components for Android date masking in Kotlin"),

      // === PUBLICATIONS ===
      sectionTitle("PUBLICATIONS"),
      bullet("Design-Driven Firebase in Flutter (Medium/Dev.to, 2025)"),
      bullet("Swift Protocol Magic (Medium/Dev.to, 2025)"),
      bullet("Flutter Dio Interceptors + Unit Test (Medium, 2023)"),
      bullet("A Start-up\u2019s Guide to iOS User Notifications (Medium, 2023)"),

      // === EDUCATION ===
      sectionTitle("EDUCATION"),
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text: "Bachelor\u2019s degree, Information Technology", bold: true, size: 22 }),
        ],
      }),
      new Paragraph({
        spacing: { after: 20 },
        children: [
          new TextRun({ text: "Islamic University of Gaza", color: ACCENT, size: 20 }),
          new TextRun({ text: "  |  01/2014 - 01/2018", size: 18, color: MUTED }),
        ],
      }),
    ],
  }],
});

// Helper functions
function sectionTitle(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text })],
  });
}

function jobHeader(title, company, period, location) {
  return new Paragraph({
    spacing: { before: 200, after: 40 },
    children: [
      new TextRun({ text: title, bold: true, size: 23, color: DARK }),
      new TextRun({ text: "  \u2014  ", size: 21, color: MUTED }),
      new TextRun({ text: company, bold: true, size: 21, color: ACCENT }),
      new TextRun({ text: `\n${period}  |  ${location}`, size: 18, color: MUTED, break: 1 }),
    ],
  });
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 40 },
    children: [new TextRun({ text, size: 20 })],
  });
}

function techLine(text) {
  return new Paragraph({
    spacing: { after: 120 },
    indent: { left: 540 },
    children: [new TextRun({ text: `Tech: ${text}`, size: 18, italics: true, color: MUTED })],
  });
}

function skillLine(category, items) {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${category}: `, bold: true, size: 21 }),
      new TextRun({ text: items, size: 20 }),
    ],
  });
}

// Generate
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outputPath, buffer);
  console.log(JSON.stringify({ success: true, path: outputPath, size: buffer.length }));
}).catch(err => {
  console.log(JSON.stringify({ success: false, error: err.message }));
});
