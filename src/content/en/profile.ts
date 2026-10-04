import type { Profile } from "../schema";

/**
 * EXAMPLE PROFILE — Jordan Rivera is a fictional person.
 *
 * Every employer, project, school, certification and link below is invented to
 * demonstrate the template. The email uses the reserved `example.com` domain, the GitHub
 * and LinkedIn links point to those sites' home pages (not to anyone's profile), and the
 * website link points to the template author's own site.
 * Replace this file with your own information (docs/customization.md walks through
 * each field) and set `isExample: false`.
 *
 * The site renders this file and the AI assistant answers only from it, so keep it
 * accurate and public: anything written here can be repeated to visitors.
 */
export const profile: Profile = {
  isExample: true,

  person: {
    name: "Jordan Rivera",
    shortName: "Jordan",
    headline: "Product engineer · TypeScript, Python & applied AI",
    summary: "Building web products end to end and helping teams ship AI features people can trust.",
    location: "Uberlândia, Minas Gerais, Brazil",
  },

  about: {
    bio: [
      "I'm a product engineer with about eight years of experience building web applications. I like owning a feature from the first conversation with users to the dashboard that shows whether it worked.",
      "Lately I've focused on applied AI: assistants and search features that are grounded in real data, evaluated before they ship and honest about what they don't know.",
      "I work remotely from Uberlândia, Brazil, and do my best work in small, senior teams where engineers talk to customers.",
    ],
    highlights: [
      "End-to-end product features in TypeScript and Python",
      "AI features grounded in real data, with evaluation and a human hand-off",
      "Fast, accessible interfaces that work well with a keyboard",
      "Small, frequent releases backed by tests and feature flags",
    ],
    interests: [
      "Long-distance cycling along the Atlantic coast",
      "Film photography and darkroom printing",
      "Volunteering at a weekend coding club for teenagers",
    ],
  },

  skills: [
    { group: "Languages", items: ["TypeScript", "JavaScript", "Python", "SQL"] },
    { group: "Frontend", items: ["React", "Next.js", "Tailwind CSS", "Web accessibility (WCAG)"] },
    { group: "Backend & data", items: ["Node.js", "FastAPI", "PostgreSQL", "REST APIs", "Background jobs"] },
    { group: "Applied AI", items: ["LLM integration", "Prompt design", "Retrieval and grounding", "Evaluation sets"] },
    { group: "Practices", items: ["Automated testing", "CI/CD", "Feature flags", "Observability"] },
  ],

  experience: [
    {
      id: "acme-cloud",
      role: "Senior Product Engineer",
      organization: "Acme Cloud",
      location: "Remote",
      period: { start: "2023-02" },
      summary: "Route-planning software for small delivery companies.",
      highlights: [
        "Led a four-person squad that rebuilt the dispatcher dashboard in Next.js and TypeScript, cutting median page load from 4.1 s to 1.6 s.",
        "Shipped an AI support assistant grounded in help-center articles, with a 300-question evaluation set and a hand-off to human agents.",
        "Introduced feature flags, preview environments and contract tests, moving the team from weekly to daily deploys.",
        "Mentored three engineers through their first on-call rotations.",
      ],
      stack: ["TypeScript", "Next.js", "Node.js", "PostgreSQL", "Python", "AWS"],
    },
    {
      id: "example-labs",
      role: "Software Engineer",
      organization: "Example Labs",
      location: "Remote",
      period: { start: "2020-06", end: "2023-01" },
      summary: "A product studio building web apps for clients in health, retail and education.",
      highlights: [
        "Built and maintained REST APIs in Python (FastAPI) and PostgreSQL for five client products.",
        "Created a shared React component library with automated accessibility checks, reused across four projects.",
        "Designed a nightly import pipeline that validates partner CSV files, replacing a manual process.",
      ],
      stack: ["Python", "FastAPI", "PostgreSQL", "React", "TypeScript", "Docker"],
    },
    {
      id: "independent",
      role: "Freelance Web Developer",
      organization: "Independent",
      location: "Uberlândia, Brazil",
      period: { start: "2018-09", end: "2020-05" },
      highlights: [
        "Designed and built websites and booking tools for local businesses, from first sketch to hosting and maintenance.",
        "Worked directly with owners to turn loose requirements into small, shippable releases.",
      ],
      stack: ["JavaScript", "Vue.js", "PHP", "MySQL"],
    },
  ],

  projects: [
    {
      id: "support-assistant",
      title: "Grounded support assistant",
      summary:
        "An AI assistant that answers customer questions using only Acme Cloud's help-center articles and hands the conversation to a person when it isn't sure.",
      role: "Tech lead",
      period: { start: "2024-03", end: "2025-01" },
      status: "In production",
      category: "Product work",
      featured: true,
      highlights: [
        "An evaluation set of 300 real questions runs on every prompt or model change.",
        "Answers link to the articles they used; questions it can't answer go to the support team.",
        "Common questions get a first response in seconds instead of hours.",
      ],
      stack: ["TypeScript", "Python", "PostgreSQL full-text search", "OpenAI-compatible API"],
    },
    {
      id: "dispatch-dashboard",
      title: "Dispatcher dashboard rebuild",
      summary:
        "A rewrite of the screen dispatchers use to plan and track daily delivery routes, focused on speed and keyboard-friendly workflows.",
      role: "Engineering lead",
      period: { start: "2023-04", end: "2023-11" },
      status: "Live",
      category: "Product work",
      featured: true,
      highlights: [
        "Median page load went from 4.1 s to 1.6 s.",
        "Keyboard shortcuts cover the ten most frequent actions.",
        "Rolled out gradually behind feature flags, with no downtime.",
      ],
      stack: ["Next.js", "TypeScript", "React", "PostgreSQL"],
    },
    {
      id: "csv-validator",
      title: "CSV schema validator",
      summary:
        "A small command-line tool that checks CSV files against a declared schema and explains every error in plain language.",
      role: "Author and maintainer",
      period: { start: "2022-05" },
      status: "Open source",
      category: "Open source",
      featured: true,
      highlights: [
        "Error reports point to the exact row and column.",
        "Runs in CI pipelines and as a pre-commit hook.",
      ],
      stack: ["Python"],
    },
    {
      id: "clinic-booking",
      title: "Clinic booking site",
      summary:
        "A website with online appointment booking and email reminders for a small physiotherapy clinic.",
      role: "Designer and developer",
      period: { start: "2019-02", end: "2019-06" },
      status: "Delivered",
      category: "Client work",
      stack: ["Vue.js", "PHP", "MySQL"],
    },
  ],

  education: [
    {
      id: "bsc-computer-science",
      degree: "B.Sc. in Computer Science",
      institution: "Example University",
      location: "Porto, Portugal",
      period: { start: "2014-09", end: "2018-07" },
      details: ["Final project: a mobile app for sharing cycling routes, built by a team of four."],
    },
  ],

  certifications: [
    { name: "Accessible Web Design", issuer: "Example Academy", date: "2022-10" },
    { name: "Applied Machine Learning Fundamentals", issuer: "Example Institute", date: "2023-06" },
  ],

  languages: [
    { name: "Portuguese", level: "Native" },
    { name: "English", level: "Fluent" },
    { name: "Spanish", level: "Conversational" },
  ],

  contact: {
    email: "hello@example.com",
    availability:
      "Open to senior product engineering roles and a limited number of freelance projects from January 2027.",
    responseTime: "Usually replies within two business days.",
    social: [
      { platform: "github", label: "GitHub", href: "https://github.com" },
      { platform: "linkedin", label: "LinkedIn", href: "https://www.linkedin.com" },
      { platform: "website", label: "mikin.ai", href: "https://mikin.ai" },
    ],
  },

  resume: {
    updated: "2026-09",
  },

  seo: {
    description:
      "Jordan Rivera is a product engineer who builds web products end to end and ships grounded AI features. Projects, experience and contact details.",
    keywords: ["Jordan Rivera", "product engineer", "TypeScript", "Python", "applied AI", "portfolio"],
  },

  assistant: {
    name: "Jordan's AI assistant",
    suggestedQuestions: [
      "What has Jordan built with AI?",
      "Which technologies does Jordan use most?",
      "Is Jordan available for new work?",
    ],
    faq: [
      {
        question: "Is Jordan Rivera a real person?",
        answer:
          "No. Jordan Rivera is a fictional example profile used to demonstrate this portfolio template. The employers, projects and contact details are placeholders.",
      },
      {
        question: "How does Jordan approach AI features?",
        answer:
          "Jordan starts from a concrete user problem, grounds the model in data the team controls, builds an evaluation set before launch and always plans a path to a person when the model isn't confident.",
      },
      {
        question: "What kind of work is Jordan looking for?",
        answer:
          "Senior product engineering roles on small, product-focused teams, and a limited number of freelance projects. The Contact page has the current availability.",
      },
      {
        question: "Does Jordan work remotely?",
        answer: "Yes. Jordan is based in Uberlândia, Minas Gerais, Brazil, and works remotely.",
      },
      {
        question: "What are Jordan's rates?",
        answer:
          "Rates aren't published on this site. Visitors who want to discuss a project should use the Contact page.",
      },
    ],
    instructions: [
      "Keep answers short: two brief paragraphs or a short list, unless the visitor asks for more detail.",
    ],
  },
};
