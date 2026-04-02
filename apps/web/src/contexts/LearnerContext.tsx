"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { apiClient } from "@/lib/api-client";
import { USE_MOCK } from "@/lib/auth";

export interface Capability {
  id: string;
  name: string;
  current_level: number;
  target_level: number;
  progress: number;
  status: "critical" | "attention" | "proficient" | "advanced";
  trend: "improving" | "stable" | "declining";
}

export interface Domain {
  id: string;
  domain_name: string;
  capabilities: Capability[];
}

export interface FocusSkill {
  id: string;
  name: string;
  current_level: number;
  target_level: number;
  progress: number;
  status: "critical" | "attention" | "proficient" | "advanced";
  trend: "improving" | "stable" | "declining";
  domain: string;
  recommendation: string;
}

export interface FocusSession {
  id: string;
  title: string;
  relatedSkill: string;
  difficulty: string;
  duration: string;
  category: string;
}

export interface Milestone {
  id: string;
  label: string;
  completed: boolean;
}

export interface Category {
  id: string;
  name: string;
  targetLearner: string;
  objective: string;
  current_level: number;
  target_level: number;
  baseline_level: number;
  timeEstimate: string;
  domains: Domain[];
  focusSkills: FocusSkill[];
  focusSessions: FocusSession[];
  milestones: Milestone[];
  strengths: { name: string; progress: number }[];
  focusAreas: { name: string; progress: number; gap: string; detail: string }[];
  insightBanner: string;
  nextStepTitle: string;
  nextStepDescription: string;
}

export interface Learner {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string;
}

// ─── Default data ────────────────────────────────────────────────────────────

const defaultCategory: Category = {
  id: "p1",
  name: "Strategic Leadership",
  targetLearner: "Maria Chen · Product Manager",
  objective: "Master strategic decision making and stakeholder alignment for senior leadership readiness",
  current_level: 3.1,
  target_level: 4.0,
  baseline_level: 2.2,
  timeEstimate: "8 weeks",
  insightBanner: "Your pattern recognition in stakeholder scenarios improved 15% this week. Your Evidence anchoring still trails your Reframing strength — focus practice there.",
  nextStepTitle: "Distributed Team Communication",
  nextStepDescription: "A 45-minute scenario focused on navigating stakeholder misalignment across distributed teams. Targets your declining Context Setting skill.",
  domains: [
    {
      id: "d1",
      domain_name: "Analytical Thinking",
      capabilities: [
        { id: "c1", name: "Data-Driven Judgment", current_level: 1.8, target_level: 3.5, progress: 35, status: "critical", trend: "declining" },
        { id: "c2", name: "Risk Assessment", current_level: 1.2, target_level: 3.0, progress: 22, status: "critical", trend: "stable" },
        { id: "c3", name: "Data Interpretation", current_level: 2.2, target_level: 3.5, progress: 45, status: "attention", trend: "improving" },
        { id: "c4", name: "Hypothesis Formation", current_level: 1.6, target_level: 3.0, progress: 32, status: "attention", trend: "stable" },
      ],
    },
    {
      id: "d2",
      domain_name: "Strategic Vision",
      capabilities: [
        { id: "c5", name: "Stakeholder Impact Analysis", current_level: 0.8, target_level: 3.5, progress: 15, status: "critical", trend: "declining" },
        { id: "c6", name: "Vision Setting", current_level: 3.2, target_level: 4.0, progress: 72, status: "proficient", trend: "improving" },
        { id: "c7", name: "Priority Management", current_level: 2.8, target_level: 3.5, progress: 65, status: "proficient", trend: "stable" },
      ],
    },
    {
      id: "d3",
      domain_name: "Communication",
      capabilities: [
        { id: "c8", name: "Context Setting", current_level: 2.6, target_level: 3.5, progress: 58, status: "attention", trend: "declining" },
        { id: "c9", name: "Conflict Resolution", current_level: 1.4, target_level: 3.0, progress: 30, status: "attention", trend: "improving" },
        { id: "c10", name: "Active Listening", current_level: 1.8, target_level: 3.0, progress: 42, status: "attention", trend: "stable" },
        { id: "c11", name: "Executive Presence", current_level: 1.0, target_level: 3.0, progress: 20, status: "attention", trend: "stable" },
        { id: "c12", name: "Persuasion", current_level: 1.2, target_level: 3.0, progress: 25, status: "attention", trend: "improving" },
      ],
    },
    {
      id: "d4",
      domain_name: "Adaptability",
      capabilities: [
        { id: "c13", name: "Feedback Integration", current_level: 2.4, target_level: 3.5, progress: 55, status: "attention", trend: "improving" },
        { id: "c14", name: "Ambiguity Tolerance", current_level: 1.8, target_level: 3.0, progress: 40, status: "attention", trend: "stable" },
      ],
    },
    {
      id: "d5",
      domain_name: "Collaboration",
      capabilities: [
        { id: "c15", name: "Cross-Functional Partnership", current_level: 2.8, target_level: 3.5, progress: 60, status: "proficient", trend: "improving" },
        { id: "c16", name: "Influence Without Authority", current_level: 2.0, target_level: 3.5, progress: 44, status: "attention", trend: "improving" },
      ],
    },
  ],
  focusSkills: [
    { id: "fs1", name: "Data-Driven Judgment", current_level: 1.8, target_level: 3.5, progress: 35, status: "critical", trend: "declining", domain: "Analytical Thinking", recommendation: "Practice interpreting ambiguous data sets in time-constrained scenarios" },
    { id: "fs2", name: "Show Your Work", current_level: 2.2, target_level: 3.5, progress: 45, status: "attention", trend: "improving", domain: "Analytical Thinking", recommendation: "Focus on articulating reasoning chains before reaching conclusions" },
    { id: "fs3", name: "Context Setting", current_level: 2.6, target_level: 3.5, progress: 58, status: "attention", trend: "declining", domain: "Communication", recommendation: "Start each conversation by framing the problem space clearly" },
  ],
  focusSessions: [
    { id: "sess1", title: "Crisis Communication Plan", relatedSkill: "Context Setting", difficulty: "Advanced", duration: "40 min", category: "Communication" },
    { id: "sess2", title: "Data-Driven Roadmap Defense", relatedSkill: "Data-Driven Judgment", difficulty: "Intermediate", duration: "35 min", category: "Analytical Thinking" },
    { id: "sess3", title: "Stakeholder Negotiation Simulation", relatedSkill: "Influence Without Authority", difficulty: "Advanced", duration: "45 min", category: "Collaboration" },
  ],
  milestones: [
    { id: "m1", label: "Complete baseline assessment", completed: true },
    { id: "m2", label: "First Clarify-stage session", completed: true },
    { id: "m3", label: "Reach Level 3.0 in any skill", completed: true },
    { id: "m4", label: "Complete 10 Arena sessions", completed: false },
    { id: "m5", label: "Achieve proficiency in 3+ skills", completed: false },
    { id: "m6", label: "Reach target mastery level", completed: false },
  ],
  strengths: [
    { name: "Reframing Competing Priorities", progress: 78 },
    { name: "Vision Setting", progress: 72 },
    { name: "Priority Management", progress: 65 },
  ],
  focusAreas: [
    { name: "Data-Driven Judgment", progress: 35, gap: "Critical Gap", detail: "Tends to move to solutions before grounding in available data" },
    { name: "Stakeholder Impact Analysis", progress: 15, gap: "Critical Gap", detail: "Under-explores downstream effects of decisions on stakeholders" },
    { name: "Context Setting", progress: 58, gap: "Needs Attention", detail: "Declining — needs deliberate practice on framing problem spaces" },
  ],
};

const defaultLearner: Learner = {
  id: "l1",
  name: "Maria Chen",
  email: "maria@acme.com",
  role: "Product Manager",
  avatar: "MC",
};

interface LearnerContextType {
  learner: Learner;
  activeCategory: Category;
  categories: Category[];
  setActiveCategory: (id: string) => void;
}

const LearnerContext = createContext<LearnerContextType | null>(null);

export function LearnerProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([defaultCategory]);
  const [activeCategoryId, setActiveCategoryId] = useState(defaultCategory.id);
  const [learner, setLearner] = useState<Learner>(defaultLearner);

  // Try fetching from API when not in mock mode
  useEffect(() => {
    if (USE_MOCK) return;

    async function fetchCategory() {
      try {
        const data = await apiClient.getActiveCategory();
        const category: Category = {
          id: data.id,
          name: data.name,
          objective: data.objective || "",
          targetLearner: data.target_learner || "",
          current_level: data.current_level,
          target_level: data.target_level,
          baseline_level: data.baseline_level,
          timeEstimate: data.time_estimate || "8 weeks",
          insightBanner: data.insight_banner || "",
          nextStepTitle: data.next_step_title || "",
          nextStepDescription: data.next_step_description || "",
          domains: data.domains.map((d) => ({
            id: d.id,
            domain_name: d.domain_name,
            capabilities: d.capabilities.map((c) => ({
              id: c.id,
              name: c.name,
              current_level: c.current_level,
              target_level: c.target_level,
              progress: c.progress,
              status: c.status as Capability["status"],
              trend: c.trend as Capability["trend"],
            })),
          })),
          milestones: data.milestones.map((m) => ({ id: m.id, label: m.label, completed: m.completed })),
          focusSessions: data.focus_sessions.map((s) => ({
            id: s.id,
            title: s.title,
            relatedSkill: s.related_skill || "",
            difficulty: s.difficulty,
            duration: s.duration,
            category: s.category || "",
          })),
          focusSkills: data.focus_skills.map((fs) => ({
            id: fs.id,
            name: fs.name,
            current_level: fs.current_level,
            target_level: fs.target_level,
            progress: fs.progress,
            status: fs.status as FocusSkill["status"],
            trend: fs.trend as FocusSkill["trend"],
            domain: fs.domain,
            recommendation: fs.recommendation || "",
          })),
          strengths: data.strengths,
          focusAreas: data.focus_areas,
        };
        setCategories([category]);
        setActiveCategoryId(category.id);
      } catch (error) {
        // 404 is expected when no categories exist yet — only log unexpected errors
        const isExpected = error && typeof error === "object" && "message" in error &&
          String((error as Error).message).includes("404");
        if (!isExpected) {
          console.error("Failed to load learner data:", error);
        }
      }
    }

    fetchCategory();
  }, []);

  const activeCategory = categories.find((p) => p.id === activeCategoryId) || categories[0];

  return (
    <LearnerContext.Provider
      value={{
        learner,
        activeCategory,
        categories,
        setActiveCategory: setActiveCategoryId,
      }}
    >
      {children}
    </LearnerContext.Provider>
  );
}

export function useLearner() {
  const ctx = useContext(LearnerContext);
  if (!ctx) throw new Error("useLearner must be used within LearnerProvider");
  return ctx;
}
