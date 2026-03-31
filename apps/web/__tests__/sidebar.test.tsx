import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Sidebar } from "@/components/layout/sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("@/contexts/LearnerContext", () => ({
  useLearner: () => ({
    learner: { id: "l1", name: "Maria Chen", email: "maria@acme.com", role: "Product Manager", avatar: "MC" },
    activeCategory: { name: "Strategic Leadership" },
  }),
}));

describe("Sidebar", () => {
  it("renders the Arena logo text", () => {
    render(<Sidebar />);
    expect(screen.getByText("Arena")).toBeInTheDocument();
  });

  it("renders simplified navigation (4 items)", () => {
    render(<Sidebar />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("Journal")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
  });

  it("highlights the active nav item", () => {
    render(<Sidebar />);
    const dashboardLink = screen.getByText("Dashboard").closest("a");
    expect(dashboardLink).toHaveClass("bg-sidebar-accent");
  });

  it("renders user info", () => {
    render(<Sidebar />);
    expect(screen.getByText("Maria Chen")).toBeInTheDocument();
    expect(screen.getByText("Product Manager")).toBeInTheDocument();
  });
});
