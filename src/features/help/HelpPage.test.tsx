import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { HelpPage } from "./HelpPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/help"]}>
      <HelpPage />
    </MemoryRouter>,
  );
}

describe("Help page", () => {
  it("renders both journeys, shortcuts, and no serious axe violations", async () => {
    const { container } = renderPage();

    expect(await screen.findByRole("heading", { name: "How CivicFlow works" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Run a service week" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "From interest to impact" })).toBeInTheDocument();
    expect(screen.getByText("Search every screen from anywhere.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Schedule/ })).toHaveAttribute(
      "href",
      "/coordinator/schedule",
    );

    const results = await axe(container);
    const blocking = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(blocking).toEqual([]);
  });
});
