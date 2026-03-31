import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ProgressCircle } from "@/components/ui/progress-circle";

describe("ProgressCircle", () => {
  it("renders the percentage value", () => {
    render(<ProgressCircle value={42} />);
    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("renders with custom label", () => {
    render(<ProgressCircle value={75} label="mastery" />);
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("mastery")).toBeInTheDocument();
  });

  it("renders SVG circles", () => {
    const { container } = render(<ProgressCircle value={50} size={44} strokeWidth={3.5} />);
    const circles = container.querySelectorAll("circle");
    expect(circles).toHaveLength(2);
  });

  it("hides label when showLabel is false", () => {
    render(<ProgressCircle value={30} showLabel={false} />);
    expect(screen.queryByText("30%")).not.toBeInTheDocument();
  });
});
