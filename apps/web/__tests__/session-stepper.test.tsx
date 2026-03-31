import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SessionStepper } from "@/components/ui/session-stepper";
import { arenaSession } from "@/lib/mock-data";

describe("SessionStepper", () => {
  const steps = arenaSession.steps;

  it("renders all step labels", () => {
    render(<SessionStepper steps={steps} />);
    steps.forEach((step) => {
      expect(screen.getByText(step.label)).toBeInTheDocument();
    });
  });

  it("shows check marks for completed steps", () => {
    const { container } = render(<SessionStepper steps={steps} />);
    const completedCount = steps.filter((s) => s.completed).length;
    const checkIcons = container.querySelectorAll("svg.lucide-check");
    expect(checkIcons).toHaveLength(completedCount);
  });

  it("highlights the active step", () => {
    render(<SessionStepper steps={steps} />);
    const activeStep = steps.find((s) => s.active);
    if (activeStep) {
      const label = screen.getByText(activeStep.label);
      expect(label).toHaveClass("font-semibold");
    }
  });
});
