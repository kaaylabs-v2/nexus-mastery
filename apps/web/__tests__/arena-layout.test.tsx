import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ArenaSessionPage from "@/app/session/[id]/page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/session/session-1",
  useParams: () => ({ id: "session-1" }),
}));

describe("Arena Session", () => {
  it("renders the scenario title", () => {
    render(<ArenaSessionPage />);
    expect(screen.getByText("Distributed Team Communication")).toBeInTheDocument();
  });

  it("renders the session path stepper", () => {
    render(<ArenaSessionPage />);
    expect(screen.getByText("Frame the Situation")).toBeInTheDocument();
    expect(screen.getByText("Reflection & Transfer")).toBeInTheDocument();
  });

  it("renders stage pills", () => {
    render(<ArenaSessionPage />);
    expect(screen.getByText("Learn", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Reflect")).toBeInTheDocument();
  });

  it("renders chat messages from Nexi", () => {
    render(<ArenaSessionPage />);
    expect(screen.getAllByText("Nexi").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the input bar", () => {
    render(<ArenaSessionPage />);
    expect(screen.getByPlaceholderText("Reply to Nexi...")).toBeInTheDocument();
  });

  it("scaffold starts collapsed with toggle button", () => {
    const { container } = render(<ArenaSessionPage />);
    // Scaffold should not be visible initially (panel closed)
    expect(screen.queryByText("Thinking Scaffold")).not.toBeInTheDocument();
    // Toggle button should be visible
    const toggleBtn = container.querySelector('button[title="Open Thinking Scaffold"]');
    expect(toggleBtn).toBeInTheDocument();
  });
});
