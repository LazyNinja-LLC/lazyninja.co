/**
 * LazyNinja LLC services. To add pricing later, set `price` on a service
 * (e.g. "From $X") and it renders automatically. No pricing for now.
 */
export interface Service {
  title: string;
  summary: string;
  bullets: string[];
  icon: 'web' | 'ai' | 'tools';
  price?: string;
}

export const services: Service[] = [
  {
    title: 'Web development',
    summary: 'Fast, accessible websites and web apps that are easy to maintain.',
    bullets: [
      'Marketing and portfolio sites',
      'Web apps and dashboards',
      'Performance and accessibility tune-ups',
    ],
    icon: 'web',
  },
  {
    title: 'AI integrations',
    summary: 'Practical AI features wired into the tools and workflows you already use.',
    bullets: [
      'Chat and search over your own content',
      'Document and data extraction',
      'Automation of repetitive steps',
    ],
    icon: 'ai',
  },
  {
    title: 'Small tools',
    summary: 'Focused scripts, bots and internal tools that remove one annoying task at a time.',
    bullets: [
      'Internal dashboards and admin tools',
      'Integrations between services',
      'CLI tools and scripts',
    ],
    icon: 'tools',
  },
];

export const steps = [
  { title: 'Say hi', text: 'Send a note through the contact form with what you need and any deadlines.' },
  { title: 'Scope it', text: 'We agree on the problem, the deliverables and what "done" looks like.' },
  { title: 'Build it', text: 'Work happens in small, reviewable pieces with regular check-ins.' },
  { title: 'Hand it off', text: 'You get the code, the docs and a walkthrough, so you are never locked in.' },
];

// TODO(Tyler): review these answers so they match how you actually work.
export const faq = [
  {
    q: 'What kinds of projects are a good fit?',
    a: 'Websites, AI-powered features and small tools with a clear goal. If you are unsure, ask anyway.',
  },
  {
    q: 'How much does it cost?',
    a: 'Pricing depends on scope. Share a few details through the contact form and you will get an estimate.',
  },
  {
    q: 'Do I own the code?',
    a: 'Placeholder: confirm your ownership/licensing terms here. TODO(Tyler).',
  },
  {
    q: 'Can you work with my existing stack?',
    a: 'Usually, yes. Mention your current setup when you reach out.',
  },
];
