import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MasteryCard } from "@/components/ui/mastery-card";
import { type FocusSkill } from "@/contexts/LearnerContext";

const mockSkill: FocusSkill = {
  id: "fs1",
  name: "Data-Driven Judgment",
  current_level: 1.8,
  target_level: 3.5,
  progress: 35,
  status: "critical",
  trend: "declining",
  domain: "Analytical Thinking",
  recommendation: "Practice interpreting ambiguous data",
};

describe("MasteryCard", () => {
  it("renders the skill name", () => {
    render(<MasteryCard skill={mockSkill} />);
    expect(screen.getByText("Data-Driven Judgment")).toBeInTheDocument();
  });

  it("renders the domain", () => {
    render(<MasteryCard skill={mockSkill} />);
    expect(screen.getByText("Analytical Thinking")).toBeInTheDocument();
  });

  it("renders progress percentage", () => {
    render(<MasteryCard skill={mockSkill} />);
    expect(screen.getAllByText("35%").length).toBeGreaterThanOrEqual(1);
  });

  it("renders status badge", () => {
    render(<MasteryCard skill={mockSkill} />);
    expect(screen.getByText("Critical Gap")).toBeInTheDocument();
  });

  it("renders level progression", () => {
    render(<MasteryCard skill={mockSkill} />);
    expect(screen.getByText("Level 1.8 → 3.5")).toBeInTheDocument();
  });
});
