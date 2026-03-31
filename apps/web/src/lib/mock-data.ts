// ─── Types ───────────────────────────────────────────────────────────────────

export type MasteryStatus = "critical_gap" | "needs_attention" | "healthy" | "mastered";
export type Trend = "rising" | "declining" | "steady" | "improving";
export type SessionStage = "clarify" | "challenge" | "show_your_work" | "alternatives" | "learn_from_it";
export type JourneyType = "mandated" | "self_initiated";

export interface MasteryJourney {
  id: string;
  title: string;
  type: JourneyType;
  progress: number;
  level: string;
  status: MasteryStatus;
  trend: Trend;
  description: string;
  skills: Skill[];
  sessionsCompleted: number;
  totalSessions: number;
}

export interface Skill {
  id: string;
  name: string;
  progress: number;
  status: MasteryStatus;
  trend: Trend;
  dimension: string;
}

export interface FocusSkill {
  id: string;
  name: string;
  progress: number;
  status: MasteryStatus;
  trend: Trend;
  borderColor: string;
  recommendation: string;
}

export interface ArenaSession {
  id: string;
  title: string;
  category: string;
  difficulty: string;
  duration: string;
  description: string;
  context: string;
  task: string;
  steps: SessionStep[];
  currentStep: number;
  messages: ChatMessage[];
}

export interface SessionStep {
  id: number;
  label: string;
  stage: SessionStage;
  completed: boolean;
  active: boolean;
}

export interface ChatMessage {
  id: string;
  role: "nexi" | "user";
  content: string;
  timestamp: string;
}

export interface CapabilityDimension {
  id: string;
  name: string;
  progress: number;
  skills: Skill[];
  description: string;
}

export interface CoachingInsight {
  id: string;
  title: string;
  description: string;
  type: "strength" | "growth" | "action";
}

export interface JournalEntry {
  id: string;
  date: string;
  title: string;
  scenario: string;
  stage: SessionStage;
  summary: string;
  assumptions: string[];
  evidence: string[];
  alternatives: string[];
  outcome: string;
  notes: string;
  patternDetected?: string;
  laterReflection?: string;
}

export interface UserProfile {
  name: string;
  email: string;
  role: string;
  avatar: string;
  category: string;
  level: string;
  levelNumeric: number;
  targetLevel: number;
  trend: Trend;
  masteryStage: number;
  totalStages: number;
}

// ─── User Profile ────────────────────────────────────────────────────────────

export const userProfile: UserProfile = {
  name: "Maria Chen",
  email: "maria.chen@acme.com",
  role: "Product Manager",
  avatar: "MC",
  category: "Strategic Leadership",
  level: "Level 3.1",
  levelNumeric: 3.1,
  targetLevel: 4,
  trend: "rising",
  masteryStage: 3,
  totalStages: 5,
};

// ─── Mastery Journeys ───────────────────────────────────────────────────────

export const mandatedJourneys: MasteryJourney[] = [
  {
    id: "mj-1",
    title: "Strategic Decision Making",
    type: "mandated",
    progress: 18,
    level: "Level 2.1",
    status: "critical_gap",
    trend: "declining",
    description: "Master the frameworks and mental models needed for high-stakes strategic decisions.",
    skills: [
      { id: "s1", name: "Data-Driven Judgment", progress: 35, status: "critical_gap", trend: "declining", dimension: "Analytical Thinking" },
      { id: "s2", name: "Risk Assessment", progress: 22, status: "critical_gap", trend: "steady", dimension: "Analytical Thinking" },
      { id: "s3", name: "Stakeholder Impact Analysis", progress: 15, status: "critical_gap", trend: "declining", dimension: "Strategic Vision" },
    ],
    sessionsCompleted: 3,
    totalSessions: 12,
  },
  {
    id: "mj-2",
    title: "Cross-Functional Stakeholder Alignment",
    type: "mandated",
    progress: 35,
    level: "Level 2.4",
    status: "needs_attention",
    trend: "improving",
    description: "Build alignment across engineering, design, and business stakeholders.",
    skills: [
      { id: "s4", name: "Context Setting", progress: 58, status: "needs_attention", trend: "declining", dimension: "Communication" },
      { id: "s5", name: "Conflict Resolution", progress: 30, status: "needs_attention", trend: "improving", dimension: "Communication" },
      { id: "s6", name: "Active Listening", progress: 42, status: "needs_attention", trend: "steady", dimension: "Communication" },
    ],
    sessionsCompleted: 5,
    totalSessions: 10,
  },
];

export const selfInitiatedJourneys: MasteryJourney[] = [
  {
    id: "sj-1",
    title: "Strategic Leadership",
    type: "self_initiated",
    progress: 62,
    level: "Level 3.1",
    status: "healthy",
    trend: "rising",
    description: "Develop strategic thinking capabilities for leadership roles.",
    skills: [
      { id: "s7", name: "Vision Setting", progress: 72, status: "healthy", trend: "rising", dimension: "Strategic Vision" },
      { id: "s8", name: "Priority Management", progress: 65, status: "healthy", trend: "steady", dimension: "Strategic Vision" },
    ],
    sessionsCompleted: 8,
    totalSessions: 12,
  },
  {
    id: "sj-2",
    title: "Evidence-Based Decision Making",
    type: "self_initiated",
    progress: 38,
    level: "Level 2.3",
    status: "needs_attention",
    trend: "improving",
    description: "Strengthen ability to make decisions backed by data and evidence.",
    skills: [
      { id: "s9", name: "Data Interpretation", progress: 45, status: "needs_attention", trend: "improving", dimension: "Analytical Thinking" },
      { id: "s10", name: "Hypothesis Formation", progress: 32, status: "needs_attention", trend: "steady", dimension: "Analytical Thinking" },
    ],
    sessionsCompleted: 4,
    totalSessions: 10,
  },
  {
    id: "sj-3",
    title: "Stakeholder Communication",
    type: "self_initiated",
    progress: 22,
    level: "Level 1.4",
    status: "needs_attention",
    trend: "steady",
    description: "Improve communication with cross-functional stakeholders.",
    skills: [
      { id: "s11", name: "Executive Presence", progress: 20, status: "needs_attention", trend: "steady", dimension: "Communication" },
      { id: "s12", name: "Persuasion", progress: 25, status: "needs_attention", trend: "improving", dimension: "Communication" },
    ],
    sessionsCompleted: 2,
    totalSessions: 10,
  },
];

// ─── Focus Skills ────────────────────────────────────────────────────────────

export const focusSkills: FocusSkill[] = [
  {
    id: "fs-1",
    name: "Data-Driven Judgment",
    progress: 35,
    status: "critical_gap",
    trend: "declining",
    borderColor: "#DC2626",
    recommendation: "Practice interpreting ambiguous data sets in time-constrained scenarios",
  },
  {
    id: "fs-2",
    name: "Show Your Work",
    progress: 45,
    status: "needs_attention",
    trend: "improving",
    borderColor: "#F59E0B",
    recommendation: "Focus on articulating reasoning chains before reaching conclusions",
  },
  {
    id: "fs-3",
    name: "Context Setting",
    progress: 58,
    status: "needs_attention",
    trend: "declining",
    borderColor: "#F59E0B",
    recommendation: "Start each conversation by framing the problem space clearly",
  },
];

// ─── Arena Session ──────────────────────────────────────────────────────────

export const arenaSession: ArenaSession = {
  id: "session-1",
  title: "Distributed Team Communication",
  category: "Stakeholder Alignment",
  difficulty: "Advanced",
  duration: "45 min",
  description: "Navigate a complex stakeholder misalignment scenario involving distributed teams across three time zones with conflicting priorities.",
  context: "You are the product manager for a B2B SaaS platform. Your engineering team in Berlin wants to prioritize technical debt, the design team in SF is pushing for a UX overhaul, and the sales team in Singapore needs three customer-requested features by Q3. The VP of Product wants a unified roadmap by Friday.",
  task: "Develop a communication strategy that addresses all stakeholder concerns while maintaining strategic alignment with company goals.",
  steps: [
    { id: 1, label: "Frame the Situation", stage: "clarify", completed: true, active: false },
    { id: 2, label: "Identify Stakeholders", stage: "clarify", completed: true, active: false },
    { id: 3, label: "Map Competing Interests", stage: "clarify", completed: true, active: false },
    { id: 4, label: "Challenge Assumptions", stage: "challenge", completed: false, active: true },
    { id: 5, label: "Test Your Logic", stage: "challenge", completed: false, active: false },
    { id: 6, label: "Build Evidence Base", stage: "show_your_work", completed: false, active: false },
    { id: 7, label: "Document Reasoning", stage: "show_your_work", completed: false, active: false },
    { id: 8, label: "Explore Option A", stage: "alternatives", completed: false, active: false },
    { id: 9, label: "Explore Option B", stage: "alternatives", completed: false, active: false },
    { id: 10, label: "Compare Tradeoffs", stage: "alternatives", completed: false, active: false },
    { id: 11, label: "Synthesize Learning", stage: "learn_from_it", completed: false, active: false },
    { id: 12, label: "Reflection & Transfer", stage: "learn_from_it", completed: false, active: false },
  ],
  currentStep: 4,
  messages: [
    {
      id: "m1",
      role: "nexi",
      content: "Welcome to your Arena Session on Distributed Team Communication. Let's start by framing the situation. You have three teams across different time zones with competing priorities. What do you think is the core tension here?",
      timestamp: "10:00 AM",
    },
    {
      id: "m2",
      role: "user",
      content: "The core tension is that each team has legitimate needs but limited resources. Engineering needs tech debt addressed for velocity, design wants UX improvements for retention, and sales needs features for revenue.",
      timestamp: "10:02 AM",
    },
    {
      id: "m3",
      role: "nexi",
      content: "Good framing. You've identified resource scarcity as the root. But I want to challenge something — are these really competing priorities, or have they been framed that way because of organizational silos? What would happen if you looked for overlap between technical debt reduction and the UX overhaul?",
      timestamp: "10:03 AM",
    },
    {
      id: "m4",
      role: "user",
      content: "That's a good point. Some of the tech debt might actually involve the frontend components that the design team wants to overhaul. Addressing both simultaneously could be more efficient.",
      timestamp: "10:05 AM",
    },
    {
      id: "m5",
      role: "nexi",
      content: "Now we're getting somewhere. You've just challenged your initial assumption that these are zero-sum tradeoffs. Let's push further — what assumptions are you making about the sales team's feature requests? Are all three features truly independent asks, or might some address the same underlying customer pain point?",
      timestamp: "10:06 AM",
    },
  ],
};

// ─── Capability Dimensions ──────────────────────────────────────────────────

export const capabilityDimensions: CapabilityDimension[] = [
  {
    id: "cd-1",
    name: "Analytical Thinking",
    progress: 38,
    description: "Ability to break down complex problems, analyze data, and form evidence-based conclusions.",
    skills: [
      { id: "s1", name: "Data-Driven Judgment", progress: 35, status: "critical_gap", trend: "declining", dimension: "Analytical Thinking" },
      { id: "s2", name: "Risk Assessment", progress: 22, status: "critical_gap", trend: "steady", dimension: "Analytical Thinking" },
      { id: "s9", name: "Data Interpretation", progress: 45, status: "needs_attention", trend: "improving", dimension: "Analytical Thinking" },
      { id: "s10", name: "Hypothesis Formation", progress: 32, status: "needs_attention", trend: "steady", dimension: "Analytical Thinking" },
    ],
  },
  {
    id: "cd-2",
    name: "Strategic Vision",
    progress: 55,
    description: "Capacity to see the big picture, set direction, and align efforts toward long-term goals.",
    skills: [
      { id: "s3", name: "Stakeholder Impact Analysis", progress: 15, status: "critical_gap", trend: "declining", dimension: "Strategic Vision" },
      { id: "s7", name: "Vision Setting", progress: 72, status: "healthy", trend: "rising", dimension: "Strategic Vision" },
      { id: "s8", name: "Priority Management", progress: 65, status: "healthy", trend: "steady", dimension: "Strategic Vision" },
    ],
  },
  {
    id: "cd-3",
    name: "Communication",
    progress: 42,
    description: "Effectiveness in conveying ideas, building alignment, and navigating difficult conversations.",
    skills: [
      { id: "s4", name: "Context Setting", progress: 58, status: "needs_attention", trend: "declining", dimension: "Communication" },
      { id: "s5", name: "Conflict Resolution", progress: 30, status: "needs_attention", trend: "improving", dimension: "Communication" },
      { id: "s6", name: "Active Listening", progress: 42, status: "needs_attention", trend: "steady", dimension: "Communication" },
      { id: "s11", name: "Executive Presence", progress: 20, status: "needs_attention", trend: "steady", dimension: "Communication" },
      { id: "s12", name: "Persuasion", progress: 25, status: "needs_attention", trend: "improving", dimension: "Communication" },
    ],
  },
  {
    id: "cd-4",
    name: "Adaptability",
    progress: 48,
    description: "Flexibility to adjust approach based on context, feedback, and changing circumstances.",
    skills: [
      { id: "s13", name: "Feedback Integration", progress: 55, status: "needs_attention", trend: "improving", dimension: "Adaptability" },
      { id: "s14", name: "Ambiguity Tolerance", progress: 40, status: "needs_attention", trend: "steady", dimension: "Adaptability" },
    ],
  },
  {
    id: "cd-5",
    name: "Collaboration",
    progress: 52,
    description: "Ability to work effectively across teams, build trust, and drive collective outcomes.",
    skills: [
      { id: "s15", name: "Cross-Functional Partnership", progress: 60, status: "healthy", trend: "rising", dimension: "Collaboration" },
      { id: "s16", name: "Influence Without Authority", progress: 44, status: "needs_attention", trend: "improving", dimension: "Collaboration" },
    ],
  },
];

// ─── Coaching Insights ──────────────────────────────────────────────────────

export const coachingInsights: CoachingInsight[] = [
  {
    id: "ci-1",
    title: "Strength: Reframing Competing Priorities",
    description: "You consistently find synthesis opportunities where others see tradeoffs. This appeared in 4 of your last 6 sessions.",
    type: "strength",
  },
  {
    id: "ci-2",
    title: "Growth Area: Evidence Anchoring",
    description: "You tend to move to solutions before fully grounding your reasoning in available data. Try the 'Evidence First' framework.",
    type: "growth",
  },
  {
    id: "ci-3",
    title: "Action: Practice Assumption Surfacing",
    description: "In your next session, spend the first 5 minutes listing all assumptions before forming any conclusions.",
    type: "action",
  },
];

// ─── Weekly Progress ────────────────────────────────────────────────────────

export const weeklyProgress = {
  sessionsCompleted: 4,
  totalSessions: 6,
  minutesPracticed: 180,
  targetMinutes: 240,
  skillsImproved: 3,
  insightGenerated: "Your pattern recognition in stakeholder scenarios has improved 15% this week.",
};

// ─── Progress Chart Data ────────────────────────────────────────────────────

export const progressChartData = [
  { month: "Jan", analyticalThinking: 22, strategicVision: 35, communication: 28, adaptability: 30, collaboration: 38 },
  { month: "Feb", analyticalThinking: 25, strategicVision: 38, communication: 30, adaptability: 33, collaboration: 40 },
  { month: "Mar", analyticalThinking: 28, strategicVision: 42, communication: 33, adaptability: 36, collaboration: 42 },
  { month: "Apr", analyticalThinking: 30, strategicVision: 45, communication: 35, adaptability: 38, collaboration: 45 },
  { month: "May", analyticalThinking: 33, strategicVision: 48, communication: 38, adaptability: 42, collaboration: 48 },
  { month: "Jun", analyticalThinking: 38, strategicVision: 55, communication: 42, adaptability: 48, collaboration: 52 },
];

export const outcomeStats = [
  { label: "Sessions Completed", value: 24, change: "+8 this month" },
  { label: "Skills Improved", value: 9, change: "+3 this month" },
  { label: "Mastery Score", value: "3.1", change: "+0.4 from start" },
  { label: "Avg Session Score", value: "78%", change: "+12% trend" },
];

// ─── Journal Entries ────────────────────────────────────────────────────────

export const journalEntries: JournalEntry[] = [
  {
    id: "je-1",
    date: "2026-03-15",
    title: "Distributed Team Communication",
    scenario: "Navigating stakeholder misalignment across three time zones",
    stage: "challenge",
    summary: "Discovered that framing competing priorities as tradeoffs was itself an assumption. Found synthesis opportunities between tech debt and UX overhaul.",
    assumptions: [
      "All three teams' requests are independent and competing",
      "Resources must be split equally across teams",
      "The VP wants a single unified plan with no flexibility",
    ],
    evidence: [
      "Frontend tech debt overlaps with 60% of UX overhaul scope",
      "Two of three sales features address the same customer pain point",
      "Historical data shows phased rollouts have 40% higher success rate",
    ],
    alternatives: [
      "Parallel workstreams with shared frontend infrastructure",
      "Phased roadmap with quick wins for sales in Q2, deeper work in Q3",
      "Cross-team working group for the overlapping scope",
    ],
    outcome: "Proposed a phased approach that addresses 80% of all team needs in the first phase.",
    notes: "Need to practice this reframing technique more systematically.",
    patternDetected: "You consistently discover synthesis opportunities when you challenge the 'zero-sum' framing. This pattern has appeared in 4 of your last 6 sessions.",
  },
  {
    id: "je-2",
    date: "2026-03-12",
    title: "Budget Allocation Under Uncertainty",
    scenario: "Allocating Q3 budget with incomplete market data",
    stage: "show_your_work",
    summary: "Practiced grounding decisions in available evidence rather than intuition. Identified three data sources that changed initial allocation by 30%.",
    assumptions: [
      "Market growth will continue at current pace",
      "Competitor pricing won't change significantly",
      "Customer retention rate is stable",
    ],
    evidence: [
      "Q1 churn data shows 15% increase in enterprise segment",
      "Competitor launched a lower-priced tier last month",
      "Customer feedback mentions 'value gap' in 23% of surveys",
    ],
    alternatives: [
      "Increase retention budget by 20%, reduce acquisition spend",
      "Launch competitive response pricing for enterprise",
      "Invest in feature differentiation vs price matching",
    ],
    outcome: "Shifted 25% of budget toward retention and feature development based on evidence analysis.",
    notes: "Evidence-first approach led to very different conclusions than gut feeling.",
  },
  {
    id: "je-3",
    date: "2026-03-08",
    title: "Product Roadmap Prioritization",
    scenario: "Choosing between tech platform investment vs feature development",
    stage: "alternatives",
    summary: "Explored multiple framing options for the classic build vs ship tension. Found that sequencing matters more than choosing sides.",
    assumptions: [
      "Platform investment delays feature delivery",
      "Customers only care about visible features",
      "Engineering velocity is constant regardless of tech debt",
    ],
    evidence: [
      "Last quarter's velocity dropped 20% due to tech debt",
      "Platform improvements would benefit 3 of 5 planned features",
      "Customer interviews reveal reliability concerns in 30% of cases",
    ],
    alternatives: [
      "Platform-first: 6-week investment then accelerated feature delivery",
      "Feature-first: deliver top 2 features, then platform sprint",
      "Hybrid: targeted platform work on shared infrastructure only",
    ],
    outcome: "Recommended hybrid approach — targeted platform work on components shared by top-priority features.",
    notes: "The 'both/and' framing works better than 'either/or' when there's genuine overlap.",
    laterReflection: "Two weeks later, the hybrid approach is working well. Engineering velocity is up 15% on the refactored components.",
  },
];

// ─── Recommended Sessions ───────────────────────────────────────────────────

export const recommendedSessions = [
  {
    id: "rs-1",
    title: "Crisis Communication Plan",
    category: "Communication",
    difficulty: "Advanced",
    duration: "40 min",
    reason: "Targets your declining Context Setting skill",
  },
  {
    id: "rs-2",
    title: "Data-Driven Roadmap Defense",
    category: "Analytical Thinking",
    difficulty: "Intermediate",
    duration: "35 min",
    reason: "Strengthens your critical gap in Data-Driven Judgment",
  },
  {
    id: "rs-3",
    title: "Stakeholder Negotiation Simulation",
    category: "Collaboration",
    difficulty: "Advanced",
    duration: "45 min",
    reason: "Builds on your strength in reframing competing priorities",
  },
];

// ─── Radar Chart Data ───────────────────────────────────────────────────────

export const radarData = [
  { dimension: "Analytical", value: 38, fullMark: 100 },
  { dimension: "Strategic", value: 55, fullMark: 100 },
  { dimension: "Communication", value: 42, fullMark: 100 },
  { dimension: "Adaptability", value: 48, fullMark: 100 },
  { dimension: "Collaboration", value: 52, fullMark: 100 },
];

// ─── Helper Functions ───────────────────────────────────────────────────────

export function getStatusColor(status: MasteryStatus): string {
  switch (status) {
    case "critical_gap": return "#DC2626";
    case "needs_attention": return "#F59E0B";
    case "healthy": return "#10B981";
    case "mastered": return "#0D9488";
  }
}

export function getStatusLabel(status: MasteryStatus): string {
  switch (status) {
    case "critical_gap": return "Critical Gap";
    case "needs_attention": return "Needs Attention";
    case "healthy": return "Healthy";
    case "mastered": return "Mastered";
  }
}

export function getTrendIcon(trend: Trend): string {
  switch (trend) {
    case "rising": return "↑";
    case "declining": return "↓";
    case "steady": return "→";
    case "improving": return "↗";
  }
}

export function getStageLabel(stage: SessionStage): string {
  switch (stage) {
    case "clarify": return "Clarify";
    case "challenge": return "Challenge";
    case "show_your_work": return "Show Your Work";
    case "alternatives": return "Alternatives";
    case "learn_from_it": return "Learn From It";
  }
}
