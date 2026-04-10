import type { ProfileData } from "@/types";

export const profile: ProfileData = {
  name: "Salah Nahed",
  role: "Senior Mobile Engineer | iOS & Cross-Platform Expertise",
  location: "Cairo, Egypt",
  email: "salahnahed@icloud.com",
  phone: "+201067332825",
  summary:
    "Mobile engineering professional with 5+ years of experience in iOS development and cross-platform mobile technologies, expert in Swift and Flutter. Key achievements include the successful deployment of multi-platform applications with over 100,000 downloads and the implementation of build automation processes that reduced deployment time by 30%.",
  links: {
    github: "https://github.com/salahamassi",
    linkedin: "https://www.linkedin.com/in/salah-nahed-a73250135",
    medium: "https://medium.com/@salahamassi",
    devto: "https://dev.to/salahamassi",
    stackoverflow: "https://stackoverflow.com/users/9690736/salah-amassi",
    pubdev: "https://pub.dev/publishers/salahamassi",
  },
  experience: [
    {
      title: "Senior Mobile Developer (Flutter)",
      company: "Nologystore W.L.L",
      period: "02/2025 - Present",
      location: "Cairo, Egypt",
      description:
        "Contributing to the complete rebuild of Nology's mobile application in preparation for a major relaunch.",
      highlights: [
        "Refactored legacy Flutter code to enhance performance, readability, and long-term maintainability",
        "Improved system efficiency by 30% by replacing deprecated MongoDB GraphQL integrations with new RESTful APIs",
        "Collaborated with backend teams to test and integrate new API flows",
        "Built a fully custom Firebase In-App Messaging experience using SwiftUI (iOS) and Kotlin Jetpack Compose (Android)",
        "Published article: Design-Driven Firebase in Flutter",
      ],
      technologies: ["Flutter", "Dart", "SwiftUI", "Kotlin", "Firebase", "REST APIs"],
    },
    {
      title: "React Native Developer",
      company: "BIM Ventures",
      period: "06/2024 - 02/2025",
      location: "Cairo, Egypt",
      description:
        "Joined BIM Ventures to modernize a React Native app. Adapted to React Native from Flutter/iOS background.",
      highlights: [
        "Refactored legacy code, improved component structure, and aligned with new REST API layer",
        "Refactored fragile form logic with type-safe schemas using Zod + React Hook Form",
        "Applied automated CI/CD pipelines with Expo Application Services (EAS)",
        "Leveraged EAS Update to release hotfixes instantly, bypassing app store approval cycles",
      ],
      technologies: ["React Native", "TypeScript", "Expo", "Zod", "React Hook Form", "EAS"],
    },
    {
      title: "VP of Innovation & Mobile Team Lead",
      company: "One Studio",
      period: "12/2021 - 06/2024",
      location: "Gaza Strip",
      description:
        "Product-driven venture studio building early-stage startups. Held multiple roles combining engineering, growth, leadership, and innovation.",
      highlights: [
        "Guided mobile engineering and martech infrastructure for Famcare (Appsflyer, WebEngage, Intercom)",
        "Promoted to lead mobile engineers across startup portfolio",
        "Founded and led development of Flutter Bond, a Laravel-inspired framework",
        "Introduced internal tooling and architectural templates to accelerate app development",
        "Mentored developers and facilitated cross-functional collaboration",
        "Worked closely with marketing and growth teams for A/B testing and performance analyses",
      ],
      technologies: [
        "Flutter",
        "Dart",
        "Swift",
        "Firebase",
        "Appsflyer",
        "WebEngage",
        "Intercom",
      ],
    },
    {
      title: "iOS App Developer",
      company: "WiNCHKSA",
      period: "12/2019 - Present",
      location: "Saudi Arabia",
      description:
        "Managed core feature development for a high-traffic logistics platform serving Gulf clients.",
      highlights: [
        "Integrated Claude AI into the iOS app for intelligent order processing and customer support automation",
        "Designed and shipped a real-time order tracking experience used by thousands of users daily",
        "Built a dynamic pricing interface integrated with complex backend APIs",
        "Developed a protocol-driven option selection system (Swift Protocol Magic)",
        "Increased system stability for order flow by 90% through comprehensive testing",
        "Created WinchCore shared module powering all app variants (Client, Provider, Owner)",
        "Authored AppRouter-UIKit, a lightweight open-source navigation framework",
        "Migrated codebase to Swift async/await and introduced SwiftUI with UIKit interoperability",
        "Applied Git-based workflow with Code Magic CI/CD automation",
      ],
      technologies: [
        "Swift",
        "UIKit",
        "SwiftUI",
        "async/await",
        "Protocol-Oriented Programming",
        "Claude AI / Anthropic API",
        "Code Magic",
        "Ruby",
      ],
    },
    {
      title: "Senior iOS Developer",
      company: "ITG Software, Inc.",
      period: "06/2021 - 12/2021",
      location: "Gaza Strip",
      description:
        "Led iOS development of Hesabi, the official self-service mobile app for Jawwal, the largest telecom operator in Palestine.",
      highlights: [
        "Implemented remote identity verification using real-time ID and face capture",
        "Built a secure refresh token system using Keychain + biometric authentication",
        "Designed dynamic features: balance tracking, usage insights, top-up flows, SIM service management",
        "Delivered a multi-theme UI system with over 10 unique themes",
      ],
      technologies: ["Swift", "UIKit", "Keychain", "Face ID", "Agile"],
    },
    {
      title: "Creator & Lead Developer",
      company: "Flutter Bond (Open Source)",
      period: "02/2022 - Present",
      location: "Remote",
      description:
        "Open-source framework inspired by Laravel, enhancing mobile development with Flutter. Offers modular packages for scalable, clean architecture.",
      highlights: [
        "Bond Form: form abstraction layer with validation, dirty tracking, and dynamic logic injection",
        "Bond Cache: flexible caching layer supporting in-memory and local persistence",
        "Bond Network: declarative networking layer with interceptors and status hooks",
        "Bond Notification: native notification abstraction with channel configuration and deep linking",
        "Bond Analytics: unified interface for Firebase, Appsflyer, and Mixpanel",
        "CLI tools for scaffolding, configuration management, and rapid prototyping",
      ],
      technologies: ["Flutter", "Dart", "Laravel patterns", "CLI"],
    },
    {
      title: "AI Engineer (Part-time)",
      company: "Trivia App — devmatrash",
      period: "2024 - Present",
      location: "Remote",
      description:
        "Part-time project building an AI-powered trivia application with Claude AI integration for intelligent QA automation.",
      highlights: [
        "Built AI-powered QA Agent that reviews features, extracts use cases, and generates test scenarios automatically",
        "Integrated Claude API for intelligent content generation and automated test case creation",
        "Designed agent architecture for automated feature analysis and quality assurance workflows",
      ],
      technologies: ["Flutter", "Dart", "Claude AI / Anthropic API", "AI Agents", "Prompt Engineering"],
    },
    {
      title: "Creator — Represent Me (AI Agent Dashboard)",
      company: "Personal Project",
      period: "2026 - Present",
      location: "Cairo, Egypt",
      description:
        "Built a full AI agent system with 5 interconnected agents for automated career management — job matching, resume generation, GitHub optimization, content creation, and open source issue hunting.",
      highlights: [
        "Designed event-driven multi-agent architecture with Claude API (5 AI agents communicating via event bus)",
        "Built automated pipeline: Job found → AI analyzes fit → Resume PDF generated → Telegram notification",
        "Implemented Issue Hunter that searches GitHub for matching OSS issues, analyzes with AI, and tracks PR lifecycle",
        "Created Code Gems miner that reads repo source code and generates LinkedIn/Medium content",
        "Built ATS Resume Scanner, README Generator, and GitHub profile auto-optimizer",
      ],
      technologies: ["Next.js", "TypeScript", "Claude AI / Anthropic API", "AI Agent Architecture", "SQLite", "pdfkit", "Telegram Bot API", "Zod"],
    },
  ],
  education: [
    {
      degree: "Bachelor's degree, Information Technology",
      institution: "Islamic University of Gaza",
      period: "01/2014 - 01/2018",
    },
  ],
  skills: [
    {
      category: "Mobile Development",
      items: [
        "Swift",
        "UIKit",
        "SwiftUI",
        "Flutter",
        "Dart",
        "React Native",
        "TypeScript",
        "Kotlin",
        "Jetpack Compose",
      ],
    },
    {
      category: "Architecture & Patterns",
      items: [
        "Protocol-Oriented Programming",
        "MVVM",
        "Clean Architecture",
        "Modular Architecture",
        "async/await Concurrency",
      ],
    },
    {
      category: "AI & Automation",
      items: [
        "Claude AI / Anthropic API",
        "AI Agent Architecture",
        "Prompt Engineering",
        "Structured Output (Zod)",
        "AI-powered QA Automation",
        "LLM Integration in Mobile Apps",
      ],
    },
    {
      category: "Backend & APIs",
      items: ["REST APIs", "GraphQL", "Firebase", "MongoDB"],
    },
    {
      category: "CI/CD & DevOps",
      items: ["Code Magic", "EAS (Expo)", "Git workflows", "Ruby scripting", "Fastlane"],
    },
    {
      category: "Analytics & Growth",
      items: ["Appsflyer", "WebEngage", "Intercom", "Mixpanel", "A/B Testing"],
    },
    {
      category: "Testing",
      items: [
        "Unit Testing",
        "Snapshot Testing",
        "End-to-End Testing",
        "Integration Testing",
      ],
    },
  ],
  openSource: [
    {
      name: "Represent Me — AI Agent Dashboard",
      description: "Built a full AI agent system with 5 interconnected agents (Job Matcher, Resume Generator, GitHub Optimizer, Content Creator, Issue Hunter) using Claude API, event-driven architecture, and automated pipelines",
    },
    {
      name: "share_plus (Flutter)",
      description: "Fixed Objective-C bug in a widely used package",
    },
    {
      name: "Flutterfire CLI",
      description: "Opened PR to support flavors on the Flutterfire CLI",
    },
    {
      name: "SwifterSwift library",
      description: "Contributed to SwifterSwift library Stackview/swap #989",
    },
    {
      name: "Android FixDate EditText",
      description: "Developed and published UI Components for Android using Kotlin",
    },
  ],
  publications: [
    {
      title: "Design-Driven Firebase in Flutter",
      platform: "Medium / Dev.to",
      date: "2025",
    },
    {
      title: "Swift Protocol Magic",
      platform: "Medium / Dev.to",
      date: "2025",
    },
    {
      title: "Flutter Dio Interceptors + Unit Test",
      platform: "Medium",
      date: "2023",
    },
    {
      title: "A Start-up's Guide to iOS User Notifications",
      platform: "Medium",
      date: "2023",
    },
  ],
};
